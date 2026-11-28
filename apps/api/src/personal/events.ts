import { Hono } from 'hono';
import { and, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import {
  participants,
  personalBudgetExcludedWallets,
  personalBudgetLimits,
  personalBudgets,
  personalGroupLinkTags,
  personalGroupLinks,
  personalTags,
  personalTransactionTags,
  personalTransactions,
  personalEventGroups,
  personalEventShareMarks,
  personalEvents,
  personalWalletOptions,
  personalWalletSettings,
  personalWallets,
  trips,
} from '@cc/api-db/schema';
import { commitPersonalWrite } from '@cc/api-db/personalSync';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';
import {
  MAX_AMOUNT,
  defaultCountsFrom,
  eventState,
  eventTagName,
  eventsForShare,
  groupRowEffect,
  isCurrencyCode,
  listCountedSpending,
  uniqueTagName,
  type CurrencyCode,
  type EventExisting,
  type EventLimitInput,
  type EventRowsResponse,
  type EventView,
} from '@cc/core';
import { budgetCreateStatements, budgetMoveOnceStatements } from './budgets';
import { loadGroupSettings } from './groupShares';
import { loadReportInput } from './reports';
import { loadCachedGroupRows } from './tripCache';
import { parseJson, requireDate } from './validate';

const LINK_UPSERT_CHUNK = 8;
const LINK_TAG_CHUNK = 32;
const MARK_INSERT_CHUNK = 24;
const MARK_UPDATE_CHUNK = 50;
const TX_TAG_CHUNK = 30;
const TX_UPDATE_CHUNK = 50;
const ID_LOOKUP_CHUNK = 80;
const TAG_SHARES_LIMIT = 100;
const EXISTING_APPLY_MAX_IDS = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function parseEventName(v: unknown): string {
  if (typeof v !== 'string') {
    throw new ApiError('VALIDATION', 422, 'Invalid name');
  }
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > 30) {
    throw new ApiError('VALIDATION', 422, 'Invalid name');
  }
  return trimmed;
}

function parseGroupIds(v: unknown): string[] {
  if (!Array.isArray(v)) {
    throw new ApiError('VALIDATION', 422, 'Invalid groupIds');
  }
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid groupIds');
    }
    seen.add(item.trim());
  }
  return Array.from(seen);
}

function parseLimit(v: unknown): EventLimitInput {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new ApiError('VALIDATION', 422, 'Invalid limit');
  }
  const obj = v as Record<string, unknown>;
  if (
    typeof obj.amount !== 'number' ||
    !Number.isSafeInteger(obj.amount) ||
    obj.amount <= 0 ||
    obj.amount > MAX_AMOUNT
  ) {
    throw new ApiError('VALIDATION', 422, 'Invalid limit amount');
  }
  if (!isCurrencyCode(obj.currency)) {
    throw new ApiError('VALIDATION', 422, 'Invalid limit currency');
  }
  return { amount: obj.amount, currency: obj.currency };
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((item) => setB.has(item));
}

function emptyExisting(): EventExisting {
  return {
    own: { count: 0, totals: [] },
    shares: { count: 0, total: 0 },
    ownIds: [],
    shareRootIds: [],
  };
}

/**
 * Computes the generated tag create/rename statements for an event without merging into existing tags.
 * If `event.tagId` is null (or missing), creates a new tag; otherwise renames it when its name differs.
 */
async function syncEventTag(
  db: Db,
  userId: string,
  event: { name: string; start: string; end: string | null; tagId: string | null },
  now: string,
): Promise<{ tagId: string; tagName: string; recreated: boolean; statements: BatchItem<'sqlite'>[] }> {
  const userTags = await db
    .select({ id: personalTags.id, name: personalTags.name })
    .from(personalTags)
    .where(eq(personalTags.userId, userId))
    .all();

  const wantedBase = eventTagName(event.name, event.start, event.end);
  const current = event.tagId ? (userTags.find((t) => t.id === event.tagId) ?? null) : null;

  if (!current) {
    const tagName = uniqueTagName(
      wantedBase,
      userTags.map((t) => t.name),
    );
    const tagId = newId();
    return {
      tagId,
      tagName,
      recreated: true,
      statements: [
        db
          .insert(personalTags)
          .values({ id: tagId, userId, name: tagName, createdAt: now }) as unknown as BatchItem<'sqlite'>,
      ],
    };
  }

  const otherNames = userTags.filter((t) => t.id !== current.id).map((t) => t.name);
  const tagName = uniqueTagName(wantedBase, otherNames);
  if (current.name === tagName) {
    return { tagId: current.id, tagName, recreated: false, statements: [] };
  }

  return {
    tagId: current.id,
    tagName,
    recreated: false,
    statements: [
      db
        .update(personalTags)
        .set({ name: tagName })
        .where(and(eq(personalTags.id, current.id), eq(personalTags.userId, userId))) as unknown as BatchItem<'sqlite'>,
    ],
  };
}

/**
 * Shared batch statements for tagging group shares: upserts `personal_group_links`
 * (bumping `sync_version` and `updated_at` while leaving existing fields untouched)
 * and inserts `personal_group_link_tags`. Reused by Task 5 (`POST /me/personal/events/tag-shares`).
 */
export function tagGroupSharesStatements(
  db: Db,
  userId: string,
  items: { rootId: string; tripId: string; tagId: string }[],
  v: SQL,
  now: string,
): BatchItem<'sqlite'>[] {
  if (items.length === 0) return [];

  const uniqueLinks = new Map<string, { rootId: string; tripId: string }>();
  for (const item of items) {
    if (!uniqueLinks.has(item.rootId)) {
      uniqueLinks.set(item.rootId, { rootId: item.rootId, tripId: item.tripId });
    }
  }

  const stmts: BatchItem<'sqlite'>[] = [];
  for (const batch of chunk(Array.from(uniqueLinks.values()), LINK_UPSERT_CHUNK)) {
    stmts.push(
      db
        .insert(personalGroupLinks)
        .values(
          batch.map((item) => ({
            userId,
            rootId: item.rootId,
            tripId: item.tripId,
            walletId: null,
            categoryId: null,
            intent: null,
            excludeFromReports: 0,
            createdAt: now,
            updatedAt: now,
            syncVersion: v as unknown as number,
          })),
        )
        .onConflictDoUpdate({
          target: [personalGroupLinks.userId, personalGroupLinks.rootId],
          set: {
            updatedAt: now,
            syncVersion: v as unknown as number,
          },
        }) as unknown as BatchItem<'sqlite'>,
    );
  }

  for (const batch of chunk(items, LINK_TAG_CHUNK)) {
    stmts.push(
      db
        .insert(personalGroupLinkTags)
        .values(
          batch.map((item) => ({
            userId,
            rootId: item.rootId,
            tagId: item.tagId,
          })),
        )
        .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
    );
  }

  return stmts;
}

export async function loadUserEvents(db: Db, userId: string): Promise<EventView[]> {
  const [rows, groupRows] = await Promise.all([
    db
      .select({
        id: personalEvents.id,
        tagId: personalEvents.tagId,
        name: personalEvents.name,
        tagName: personalTags.name,
        startDate: personalEvents.startDate,
        endDate: personalEvents.endDate,
        stoppedAt: personalEvents.stoppedAt,
        countsFrom: personalEvents.countsFrom,
        budgetId: personalEvents.budgetId,
        createdAt: personalEvents.createdAt,
      })
      .from(personalEvents)
      .leftJoin(
        personalTags,
        and(eq(personalTags.id, personalEvents.tagId), eq(personalTags.userId, userId)),
      )
      .where(eq(personalEvents.userId, userId))
      .orderBy(desc(personalEvents.startDate), desc(personalEvents.createdAt))
      .all(),

    db
      .select({
        eventId: personalEventGroups.eventId,
        tripId: personalEventGroups.tripId,
      })
      .from(personalEventGroups)
      .innerJoin(personalEvents, eq(personalEvents.id, personalEventGroups.eventId))
      .where(eq(personalEvents.userId, userId))
      .all(),
  ]);

  const groupsByEvent = new Map<string, string[]>();
  for (const g of groupRows) {
    let list = groupsByEvent.get(g.eventId);
    if (!list) {
      list = [];
      groupsByEvent.set(g.eventId, list);
    }
    list.push(g.tripId);
  }

  return rows.map((r) => ({
    id: r.id,
    tagId: r.tagId ?? null,
    name: r.name,
    tagName: r.tagName ?? null,
    start: r.startDate,
    end: r.endDate ?? null,
    stoppedAt: r.stoppedAt ?? null,
    countsFrom: r.countsFrom,
    groupIds: groupsByEvent.get(r.id) ?? [],
    budgetId: r.budgetId ?? null,
    createdAt: r.createdAt,
  }));
}

async function loadUserEventById(db: Db, userId: string, id: string): Promise<EventView | null> {
  const [row, groupRows] = await Promise.all([
    db
      .select({
        id: personalEvents.id,
        tagId: personalEvents.tagId,
        name: personalEvents.name,
        tagName: personalTags.name,
        startDate: personalEvents.startDate,
        endDate: personalEvents.endDate,
        stoppedAt: personalEvents.stoppedAt,
        countsFrom: personalEvents.countsFrom,
        budgetId: personalEvents.budgetId,
        createdAt: personalEvents.createdAt,
      })
      .from(personalEvents)
      .leftJoin(
        personalTags,
        and(eq(personalTags.id, personalEvents.tagId), eq(personalTags.userId, userId)),
      )
      .where(and(eq(personalEvents.id, id), eq(personalEvents.userId, userId)))
      .get(),

    db
      .select({ tripId: personalEventGroups.tripId })
      .from(personalEventGroups)
      .where(eq(personalEventGroups.eventId, id))
      .all(),
  ]);

  if (!row) return null;

  return {
    id: row.id,
    tagId: row.tagId ?? null,
    name: row.name,
    tagName: row.tagName ?? null,
    start: row.startDate,
    end: row.endDate ?? null,
    stoppedAt: row.stoppedAt ?? null,
    countsFrom: row.countsFrom,
    groupIds: groupRows.map((g) => g.tripId),
    budgetId: row.budgetId ?? null,
    createdAt: row.createdAt,
  };
}

async function assertActiveGroups(db: Db, userId: string, groupIds: string[]): Promise<void> {
  if (groupIds.length === 0) return;
  const rows = await db
    .select({ tripId: trips.id })
    .from(participants)
    .innerJoin(trips, eq(trips.id, participants.tripId))
    .where(
      and(
        eq(participants.userId, userId),
        eq(participants.status, 'active'),
        isNull(trips.deleteAfter),
        inArray(trips.id, groupIds),
      ),
    )
    .all();

  const activeIds = new Set(rows.map((r) => r.tripId));
  if (activeIds.size !== groupIds.length) {
    throw new ApiError('VALIDATION', 422, 'Invalid groupIds');
  }
}

async function loadDefaultExcludedWalletIds(
  db: Db,
  userId: string,
  currency: CurrencyCode,
): Promise<string[]> {
  const rows = await db
    .select({ walletId: personalWallets.id })
    .from(personalWallets)
    .innerJoin(
      personalWalletOptions,
      and(
        eq(personalWalletOptions.walletId, personalWallets.id),
        eq(personalWalletOptions.userId, userId),
        eq(personalWalletOptions.excludeFromReports, 1),
      ),
    )
    .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
    .where(
      and(
        eq(personalWallets.userId, userId),
        eq(personalWallets.currency, currency),
        isNull(personalWalletSettings.archivedAt),
      ),
    )
    .all();
  return rows.map((r) => r.walletId);
}

async function computeExisting(
  db: Db,
  userId: string,
  params: {
    eventId?: string;
    tagId: string | null;
    start: string;
    end: string | null;
    countsFrom: string;
    groupIds: string[];
    previousRange?: { start: string; end: string | null };
  },
): Promise<{ existing: EventExisting; sharesToMark: string[] }> {
  const prev = params.previousRange;
  let noNewOwnDays = false;
  let prevExcludeClause: SQL | undefined;

  if (prev !== undefined) {
    if (prev.end === null) {
      noNewOwnDays = params.start >= prev.start;
      prevExcludeClause = lt(personalTransactions.date, prev.start);
    } else if (params.end === null) {
      noNewOwnDays = false;
      prevExcludeClause = or(
        lt(personalTransactions.date, prev.start),
        gt(personalTransactions.date, prev.end),
      );
    } else {
      noNewOwnDays = params.start >= prev.start && params.end <= prev.end;
      prevExcludeClause = or(
        lt(personalTransactions.date, prev.start),
        gt(personalTransactions.date, prev.end),
      );
    }
  }

  const ownRowsPromise = noNewOwnDays
    ? Promise.resolve([])
    : db
        .select({
          id: personalTransactions.id,
          amount: personalTransactions.amount,
          currency: personalWallets.currency,
        })
        .from(personalTransactions)
        .innerJoin(personalWallets, eq(personalWallets.id, personalTransactions.walletId))
        .where(
          and(
            eq(personalTransactions.userId, userId),
            eq(personalTransactions.type, 'expense'),
            eq(personalTransactions.source, 'manual'),
            gte(personalTransactions.date, params.start),
            ...(params.end !== null ? [lte(personalTransactions.date, params.end)] : []),
            ...(prevExcludeClause ? [prevExcludeClause] : []),
            ...(params.tagId !== null
              ? [
                  sql`NOT EXISTS (SELECT 1 FROM personal_transaction_tags WHERE transaction_id = ${personalTransactions.id} AND tag_id = ${params.tagId})`,
                ]
              : []),
          ),
        )
        .all();

  const sharesPromise =
    params.groupIds.length > 0
      ? Promise.all([
          loadCachedGroupRows(db, userId),
          loadGroupSettings(db, userId),
          params.eventId
            ? db
                .select({ rootId: personalEventShareMarks.rootId })
                .from(personalEventShareMarks)
                .where(
                  and(
                    eq(personalEventShareMarks.userId, userId),
                    eq(personalEventShareMarks.eventId, params.eventId),
                  ),
                )
                .all()
            : Promise.resolve([]),
        ])
      : Promise.resolve(null);

  const [ownRows, shareData] = await Promise.all([ownRowsPromise, sharesPromise]);

  const ownByCurrency = new Map<CurrencyCode, number>();
  for (const row of ownRows) {
    const cur = row.currency as CurrencyCode;
    ownByCurrency.set(cur, (ownByCurrency.get(cur) ?? 0) + row.amount);
  }
  const ownTotals = Array.from(ownByCurrency.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => {
      if (a.currency === 'VND' && b.currency !== 'VND') return -1;
      if (b.currency === 'VND' && a.currency !== 'VND') return 1;
      return b.amount - a.amount;
    });

  const sharesToMark: string[] = [];
  let sharesTotal = 0;

  if (shareData) {
    const [groupRows, settings, markRows] = shareData;
    const groupSet = new Set(params.groupIds);
    const markedRootIds = new Set(markRows.map((m) => m.rootId));

    for (const row of groupRows) {
      if (row.source !== 'expense' || row.pending) continue;
      if (!groupSet.has(row.tripId)) continue;
      if (row.date < params.countsFrom) continue;
      if (params.end !== null && row.date > params.end) continue;
      if (markedRootIds.has(row.rootId)) continue;
      if (params.tagId !== null && row.link?.tagIds.includes(params.tagId)) continue;

      const spending = groupRowEffect(row, settings).spending;
      if (spending <= 0) continue;

      markedRootIds.add(row.rootId);
      sharesToMark.push(row.rootId);
      sharesTotal += spending;
    }
  }

  return {
    existing: {
      own: { count: ownRows.length, totals: ownTotals },
      shares: { count: sharesToMark.length, total: sharesTotal },
      ownIds: ownRows.map((r) => r.id),
      shareRootIds: [...sharesToMark],
    },
    sharesToMark,
  };
}

export function eventRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/personal/events', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);
    const events = await loadUserEvents(db, user.id);
    return c.json({ events }, 200);
  });

  app.get('/me/personal/events/:id/rows', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const db = getDb(c.env);
    const event = await db
      .select({
        id: personalEvents.id,
        tagId: personalEvents.tagId,
      })
      .from(personalEvents)
      .where(and(eq(personalEvents.id, id), eq(personalEvents.userId, user.id)))
      .get();
    if (!event) {
      throw new ApiError('NOT_FOUND', 404, 'Event not found');
    }

    if (!event.tagId) {
      return c.json({ rows: [] } satisfies EventRowsResponse, 200);
    }

    const tagId = event.tagId;
    const allRows = listCountedSpending(await loadReportInput(db, user.id));
    const rows = allRows.filter((r) => r.tagIds.includes(tagId));
    return c.json({ rows } satisfies EventRowsResponse, 200);
  });

  app.post('/me/personal/events', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const name = parseEventName(body.name);
    const today = requireDate(body.today);
    const start =
      body.start !== undefined && body.start !== null ? requireDate(body.start) : today;
    const end =
      body.end !== undefined && body.end !== null ? requireDate(body.end) : null;
    const countsFrom =
      body.countsFrom !== undefined && body.countsFrom !== null
        ? requireDate(body.countsFrom)
        : defaultCountsFrom(start, today);

    if (countsFrom > start) {
      throw new ApiError('VALIDATION', 422, 'countsFrom must be on or before start');
    }
    if (end !== null && end < start) {
      throw new ApiError('invalid_range', 400, 'End date must be on or after start date');
    }

    const groupIds = parseGroupIds(body.groupIds);
    const limit =
      body.limit !== undefined && body.limit !== null ? parseLimit(body.limit) : null;

    if (limit !== null && end === null) {
      throw new ApiError('limit_needs_end', 400, 'Limit requires an end date');
    }

    const db = getDb(c.env);
    const now = nowIso();

    const [, syncedTag, excludedWalletIds, existingResult] = await Promise.all([
      assertActiveGroups(db, user.id, groupIds),
      syncEventTag(db, user.id, { name, start, end, tagId: null }, now),
      limit ? loadDefaultExcludedWalletIds(db, user.id, limit.currency) : Promise.resolve([]),
      computeExisting(db, user.id, {
        tagId: null,
        start,
        end,
        countsFrom,
        groupIds,
      }),
    ]);

    const id = newId();
    let budgetId: string | null = null;

    await commitPersonalWrite(db, user.id, (v) => {
      const stmts: BatchItem<'sqlite'>[] = [...syncedTag.statements];

      if (limit && end !== null) {
        const createdBudget = budgetCreateStatements(
          db,
          user.id,
          {
            name,
            target: { kind: 'tag', tagId: syncedTag.tagId },
            currency: limit.currency,
            amount: limit.amount,
            periodKind: 'once',
            from: countsFrom,
            to: end,
            excludedWalletIds,
            today,
          },
          v,
          now,
        );
        budgetId = createdBudget.id;
        stmts.push(...createdBudget.statements);
      }

      stmts.push(
        db.insert(personalEvents).values({
          id,
          userId: user.id,
          name,
          tagId: syncedTag.tagId,
          startDate: start,
          endDate: end,
          stoppedAt: null,
          countsFrom,
          budgetId,
          createdAt: now,
          updatedAt: now,
        }) as unknown as BatchItem<'sqlite'>,
      );

      if (groupIds.length > 0) {
        stmts.push(
          db.insert(personalEventGroups).values(
            groupIds.map((tripId) => ({
              eventId: id,
              tripId,
            })),
          ) as unknown as BatchItem<'sqlite'>,
        );
      }

      for (const batch of chunk(existingResult.sharesToMark, MARK_INSERT_CHUNK)) {
        stmts.push(
          db
            .insert(personalEventShareMarks)
            .values(
              batch.map((rootId) => ({
                userId: user.id,
                rootId,
                eventId: id,
                state: 'skipped' as const,
              })),
            )
            .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
        );
      }

      return stmts;
    });

    const event: EventView = {
      id,
      tagId: syncedTag.tagId,
      name,
      tagName: syncedTag.tagName,
      start,
      end,
      stoppedAt: null,
      countsFrom,
      groupIds,
      budgetId,
      createdAt: now,
    };

    return c.json({ event, existing: existingResult.existing }, 201);
  });

  app.post('/me/personal/events/tag-shares', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    requireDate(body.today);

    const db = getDb(c.env);
    const events = await loadUserEvents(db, user.id);
    if (events.length === 0 || events.every((t) => t.groupIds.length === 0 || t.tagId === null)) {
      return c.json({ tagged: 0 }, 200);
    }

    const [groupRows, markRows] = await Promise.all([
      loadCachedGroupRows(db, user.id),
      db
        .select({
          rootId: personalEventShareMarks.rootId,
          eventId: personalEventShareMarks.eventId,
        })
        .from(personalEventShareMarks)
        .where(eq(personalEventShareMarks.userId, user.id))
        .all(),
    ]);

    const markedKeys = new Set(markRows.map((m) => `${m.rootId}\0${m.eventId}`));
    const matches: { rootId: string; tripId: string; tagId: string; eventId: string }[] = [];
    let taggedShares = 0;

    for (const row of groupRows) {
      if (taggedShares >= TAG_SHARES_LIMIT || matches.length >= TAG_SHARES_LIMIT) break;
      if (row.pending || row.source !== 'expense' || row.myShare <= 0) continue;

      const matchedEvents = eventsForShare(events, row);
      let shareMatched = false;
      for (const match of matchedEvents) {
        if (matches.length >= TAG_SHARES_LIMIT) break;
        if (!match.tagId) continue;
        if (row.link?.tagIds.includes(match.tagId)) continue;
        const key = `${row.rootId}\0${match.id}`;
        if (markedKeys.has(key)) continue;

        markedKeys.add(key);
        matches.push({
          rootId: row.rootId,
          tripId: row.tripId,
          tagId: match.tagId,
          eventId: match.id,
        });
        shareMatched = true;
      }
      if (shareMatched) {
        taggedShares++;
      }
    }

    if (matches.length === 0) {
      return c.json({ tagged: 0 }, 200);
    }

    const now = nowIso();
    await commitPersonalWrite(db, user.id, (v) => {
      const stmts: BatchItem<'sqlite'>[] = [
        ...tagGroupSharesStatements(
          db,
          user.id,
          matches.map((m) => ({ rootId: m.rootId, tripId: m.tripId, tagId: m.tagId })),
          v,
          now,
        ),
      ];

      for (const batch of chunk(matches, MARK_INSERT_CHUNK)) {
        stmts.push(
          db
            .insert(personalEventShareMarks)
            .values(
              batch.map((m) => ({
                userId: user.id,
                rootId: m.rootId,
                eventId: m.eventId,
                state: 'tagged' as const,
              })),
            )
            .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
        );
      }

      return stmts;
    });

    return c.json({ tagged: taggedShares }, 200);
  });

  app.patch('/me/personal/events/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const today = requireDate(body.today);
    const nameInput = body.name !== undefined ? parseEventName(body.name) : undefined;
    const startInput = body.start !== undefined ? requireDate(body.start) : undefined;
    const endInput =
      body.end === undefined ? undefined : body.end === null ? null : requireDate(body.end);
    const countsFromInput =
      body.countsFrom !== undefined ? requireDate(body.countsFrom) : undefined;
    const groupIdsInput =
      body.groupIds !== undefined ? parseGroupIds(body.groupIds) : undefined;
    const limitInput =
      body.limit === undefined
        ? undefined
        : body.limit === null
          ? null
          : parseLimit(body.limit);

    const db = getDb(c.env);
    const existing = await loadUserEventById(db, user.id, id);
    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Event not found');
    }

    if (existing.stoppedAt !== null && Object.prototype.hasOwnProperty.call(body, 'end')) {
      throw new ApiError('event_stopped', 400, 'Cannot change end date of a stopped event');
    }

    const nextName = nameInput ?? existing.name;
    const nextStart = startInput ?? existing.start;
    const nextEnd = endInput !== undefined ? endInput : existing.end;
    const nextCountsFrom = countsFromInput ?? existing.countsFrom;
    const nextGroupIds = groupIdsInput ?? existing.groupIds;

    if (nextCountsFrom > nextStart) {
      throw new ApiError('VALIDATION', 422, 'countsFrom must be on or before start');
    }
    if (nextEnd !== null && nextEnd < nextStart) {
      throw new ApiError('invalid_range', 400, 'End date must be on or after start date');
    }
    if (limitInput !== undefined && limitInput !== null && nextEnd === null) {
      throw new ApiError('limit_needs_end', 400, 'Limit requires an end date');
    }

    const nameChanged = nextName !== existing.name;
    const startOrEndChanged = nextStart !== existing.start || nextEnd !== existing.end;
    const budgetRangeChanged =
      nextCountsFrom !== existing.countsFrom || nextEnd !== existing.end;
    const datesChanged = startOrEndChanged || nextCountsFrom !== existing.countsFrom;
    const groupsChanged =
      groupIdsInput !== undefined && !sameStringSet(existing.groupIds, groupIdsInput);
    const shouldSyncTag = existing.tagId === null || nameChanged || startOrEndChanged;

    const now = nowIso();
    const clearingBudget = limitInput === null || nextEnd === null;
    const creatingBudget =
      !clearingBudget && limitInput !== undefined && existing.budgetId === null;
    const updatingBudget =
      !clearingBudget && limitInput !== undefined && existing.budgetId !== null;
    const removedGroupIds = groupsChanged
      ? existing.groupIds.filter((gid) => !nextGroupIds.includes(gid))
      : [];

    const [, syncedTag, existingBudgetRow, existingResult] = await Promise.all([
      groupIdsInput ? assertActiveGroups(db, user.id, groupIdsInput) : Promise.resolve(),
      shouldSyncTag
        ? syncEventTag(
            db,
            user.id,
            { name: nextName, start: nextStart, end: nextEnd, tagId: existing.tagId },
            now,
          )
        : Promise.resolve({
            tagId: existing.tagId!,
            tagName: existing.tagName,
            recreated: false,
            statements: [] as BatchItem<'sqlite'>[],
          }),
      updatingBudget
        ? db
            .select({ currency: personalBudgets.currency })
            .from(personalBudgets)
            .where(
              and(eq(personalBudgets.id, existing.budgetId!), eq(personalBudgets.userId, user.id)),
            )
            .get()
        : Promise.resolve(undefined),
      datesChanged || groupsChanged
        ? computeExisting(db, user.id, {
            eventId: existing.id,
            tagId: existing.tagId,
            start: nextStart,
            end: nextEnd,
            countsFrom: nextCountsFrom,
            groupIds: nextGroupIds,
            previousRange: { start: existing.start, end: existing.end },
          })
        : Promise.resolve({ existing: emptyExisting(), sharesToMark: [] }),
    ]);

    const budgetCurrencyChanged =
      updatingBudget &&
      existingBudgetRow !== undefined &&
      existingBudgetRow.currency !== limitInput!.currency;
    const excludedWalletIds =
      creatingBudget || budgetCurrencyChanged
        ? await loadDefaultExcludedWalletIds(db, user.id, limitInput!.currency)
        : [];

    let nextBudgetId = existing.budgetId;

    await commitPersonalWrite(db, user.id, (v) => {
      const stmts: BatchItem<'sqlite'>[] = [...syncedTag.statements];

      if (clearingBudget) {
        if (existing.budgetId) {
          stmts.push(
            db
              .delete(personalBudgets)
              .where(
                and(eq(personalBudgets.id, existing.budgetId), eq(personalBudgets.userId, user.id)),
              ) as unknown as BatchItem<'sqlite'>,
          );
        }
        nextBudgetId = null;
      } else if (limitInput !== undefined && limitInput !== null && nextEnd !== null) {
        if (existing.budgetId === null) {
          const createdBudget = budgetCreateStatements(
            db,
            user.id,
            {
              name: nextName,
              target: { kind: 'tag', tagId: syncedTag.tagId },
              currency: limitInput.currency,
              amount: limitInput.amount,
              periodKind: 'once',
              from: nextCountsFrom,
              to: nextEnd,
              excludedWalletIds,
              today,
            },
            v,
            now,
          );
          nextBudgetId = createdBudget.id;
          stmts.push(...createdBudget.statements);
        } else {
          if (budgetRangeChanged) {
            stmts.push(
              ...budgetMoveOnceStatements(db, existing.budgetId, nextCountsFrom, nextEnd, now),
            );
          }
          if (budgetCurrencyChanged) {
            stmts.push(
              db
                .delete(personalBudgetExcludedWallets)
                .where(
                  eq(personalBudgetExcludedWallets.budgetId, existing.budgetId),
                ) as unknown as BatchItem<'sqlite'>,
            );
            if (excludedWalletIds.length > 0) {
              stmts.push(
                db.insert(personalBudgetExcludedWallets).values(
                  excludedWalletIds.map((walletId) => ({
                    budgetId: existing.budgetId!,
                    walletId,
                  })),
                ) as unknown as BatchItem<'sqlite'>,
              );
            }
          }
          stmts.push(
            db
              .update(personalBudgets)
              .set({
                name: nextName,
                ...(syncedTag.recreated ? { targetId: syncedTag.tagId } : {}),
                currency: limitInput.currency,
                updatedAt: now,
              })
              .where(
                and(eq(personalBudgets.id, existing.budgetId), eq(personalBudgets.userId, user.id)),
              ) as unknown as BatchItem<'sqlite'>,
            db
              .delete(personalBudgetLimits)
              .where(eq(personalBudgetLimits.budgetId, existing.budgetId)) as unknown as BatchItem<'sqlite'>,
            db.insert(personalBudgetLimits).values({
              budgetId: existing.budgetId,
              effectiveFrom: nextCountsFrom,
              amount: limitInput.amount,
            }) as unknown as BatchItem<'sqlite'>,
          );
        }
      } else if (existing.budgetId !== null && nextEnd !== null) {
        if (budgetRangeChanged) {
          stmts.push(
            ...budgetMoveOnceStatements(db, existing.budgetId, nextCountsFrom, nextEnd, now),
          );
        }
        if (nameChanged || syncedTag.recreated) {
          stmts.push(
            db
              .update(personalBudgets)
              .set({
                name: nextName,
                ...(syncedTag.recreated ? { targetId: syncedTag.tagId } : {}),
                updatedAt: now,
              })
              .where(
                and(eq(personalBudgets.id, existing.budgetId), eq(personalBudgets.userId, user.id)),
              ) as unknown as BatchItem<'sqlite'>,
          );
        }
      }

      stmts.push(
        db
          .update(personalEvents)
          .set({
            name: nextName,
            tagId: syncedTag.tagId,
            startDate: nextStart,
            endDate: nextEnd,
            countsFrom: nextCountsFrom,
            budgetId: nextBudgetId,
            updatedAt: now,
          })
          .where(and(eq(personalEvents.id, existing.id), eq(personalEvents.userId, user.id))) as unknown as BatchItem<'sqlite'>,
      );

      if (groupsChanged) {
        stmts.push(
          db
            .delete(personalEventGroups)
            .where(eq(personalEventGroups.eventId, existing.id)) as unknown as BatchItem<'sqlite'>,
        );
        if (nextGroupIds.length > 0) {
          stmts.push(
            db.insert(personalEventGroups).values(
              nextGroupIds.map((tripId) => ({
                eventId: existing.id,
                tripId,
              })),
            ) as unknown as BatchItem<'sqlite'>,
          );
        }
        if (removedGroupIds.length > 0) {
          stmts.push(
            db
              .delete(personalEventShareMarks)
              .where(
                and(
                  eq(personalEventShareMarks.userId, user.id),
                  eq(personalEventShareMarks.eventId, existing.id),
                  eq(personalEventShareMarks.state, 'skipped'),
                  sql`${personalEventShareMarks.rootId} IN (SELECT root_id FROM transactions WHERE is_latest = 1 AND trip_id IN (${sql.join(
                    removedGroupIds.map((gid) => sql`${gid}`),
                    sql`, `,
                  )}))`,
                ),
              ) as unknown as BatchItem<'sqlite'>,
          );
        }
      }

      for (const batch of chunk(existingResult.sharesToMark, MARK_INSERT_CHUNK)) {
        stmts.push(
          db
            .insert(personalEventShareMarks)
            .values(
              batch.map((rootId) => ({
                userId: user.id,
                rootId,
                eventId: existing.id,
                state: 'skipped' as const,
              })),
            )
            .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
        );
      }

      return stmts;
    });

    const event: EventView = {
      id: existing.id,
      tagId: syncedTag.tagId,
      name: nextName,
      tagName: syncedTag.tagName,
      start: nextStart,
      end: nextEnd,
      stoppedAt: existing.stoppedAt,
      countsFrom: nextCountsFrom,
      groupIds: nextGroupIds,
      budgetId: nextBudgetId,
      createdAt: existing.createdAt,
    };

    return c.json({ event, existing: existingResult.existing }, 200);
  });

  app.post('/me/personal/events/:id/stop', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const today = requireDate(body.today);
    const db = getDb(c.env);
    const existing = await loadUserEventById(db, user.id, id);
    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Event not found');
    }

    if (eventState(existing, today) !== 'on') {
      throw new ApiError('not_running', 409, 'Event is not running');
    }

    const now = nowIso();
    const syncedTag = await syncEventTag(
      db,
      user.id,
      { name: existing.name, start: existing.start, end: today, tagId: existing.tagId },
      now,
    );

    await commitPersonalWrite(db, user.id, () => {
      const stmts: BatchItem<'sqlite'>[] = [...syncedTag.statements];

      if (existing.budgetId) {
        stmts.push(
          ...budgetMoveOnceStatements(db, existing.budgetId, existing.countsFrom, today, now),
        );
        if (syncedTag.recreated) {
          stmts.push(
            db
              .update(personalBudgets)
              .set({ targetId: syncedTag.tagId, updatedAt: now })
              .where(
                and(eq(personalBudgets.id, existing.budgetId), eq(personalBudgets.userId, user.id)),
              ) as unknown as BatchItem<'sqlite'>,
          );
        }
      }

      stmts.push(
        db
          .update(personalEvents)
          .set({
            tagId: syncedTag.tagId,
            endDate: today,
            stoppedAt: now,
            updatedAt: now,
          })
          .where(and(eq(personalEvents.id, existing.id), eq(personalEvents.userId, user.id))) as unknown as BatchItem<'sqlite'>,
      );

      return stmts;
    });

    const event: EventView = {
      ...existing,
      tagId: syncedTag.tagId,
      tagName: syncedTag.tagName,
      end: today,
      stoppedAt: now,
    };

    return c.json({ event }, 200);
  });

  app.post('/me/personal/events/:id/resume', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const today = requireDate(body.today);
    const db = getDb(c.env);
    const existing = await loadUserEventById(db, user.id, id);
    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Event not found');
    }

    if (existing.stoppedAt === null) {
      throw new ApiError('CONFLICT', 409, 'Event is not stopped');
    }

    const now = nowIso();
    const gapStart = existing.end;

    const syncedTag = await syncEventTag(
      db,
      user.id,
      { name: existing.name, start: existing.start, end: null, tagId: existing.tagId },
      now,
    );

    const existingResult =
      gapStart !== null && gapStart <= today
        ? await computeExisting(db, user.id, {
            eventId: existing.id,
            tagId: syncedTag.recreated ? null : syncedTag.tagId,
            start: gapStart,
            end: today,
            countsFrom: gapStart,
            groupIds: existing.groupIds,
          })
        : { existing: emptyExisting(), sharesToMark: [] };

    await commitPersonalWrite(db, user.id, () => {
      const stmts: BatchItem<'sqlite'>[] = [...syncedTag.statements];

      if (existing.budgetId) {
        stmts.push(
          db
            .delete(personalBudgets)
            .where(
              and(eq(personalBudgets.id, existing.budgetId), eq(personalBudgets.userId, user.id)),
            ) as unknown as BatchItem<'sqlite'>,
        );
      }

      stmts.push(
        db
          .update(personalEvents)
          .set({
            tagId: syncedTag.tagId,
            endDate: null,
            stoppedAt: null,
            budgetId: null,
            updatedAt: now,
          })
          .where(and(eq(personalEvents.id, existing.id), eq(personalEvents.userId, user.id))) as unknown as BatchItem<'sqlite'>,
      );

      for (const batch of chunk(existingResult.sharesToMark, MARK_INSERT_CHUNK)) {
        stmts.push(
          db
            .insert(personalEventShareMarks)
            .values(
              batch.map((rootId) => ({
                userId: user.id,
                rootId,
                eventId: existing.id,
                state: 'skipped' as const,
              })),
            )
            .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
        );
      }

      return stmts;
    });

    const event: EventView = {
      ...existing,
      tagId: syncedTag.tagId,
      tagName: syncedTag.tagName,
      end: null,
      stoppedAt: null,
      budgetId: null,
    };

    return c.json({ event, existing: existingResult.existing }, 200);
  });

  app.post('/me/personal/events/:id/start-now', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const today = requireDate(body.today);
    const db = getDb(c.env);
    const existing = await loadUserEventById(db, user.id, id);
    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Event not found');
    }

    if (eventState(existing, today) !== 'upcoming') {
      throw new ApiError('CONFLICT', 409, 'Event is not upcoming');
    }

    const nextStart = today;
    const nextCountsFrom = existing.countsFrom < today ? existing.countsFrom : today;
    const now = nowIso();

    const [syncedTag, existingResult] = await Promise.all([
      syncEventTag(
        db,
        user.id,
        { name: existing.name, start: nextStart, end: existing.end, tagId: existing.tagId },
        now,
      ),
      computeExisting(db, user.id, {
        eventId: existing.id,
        tagId: existing.tagId,
        start: today,
        end: today,
        countsFrom: nextCountsFrom,
        groupIds: existing.groupIds,
      }),
    ]);

    await commitPersonalWrite(db, user.id, () => {
      const stmts: BatchItem<'sqlite'>[] = [...syncedTag.statements];

      if (existing.budgetId) {
        if (nextCountsFrom !== existing.countsFrom && existing.end !== null) {
          stmts.push(
            ...budgetMoveOnceStatements(db, existing.budgetId, nextCountsFrom, existing.end, now),
          );
        }
        if (syncedTag.recreated) {
          stmts.push(
            db
              .update(personalBudgets)
              .set({ targetId: syncedTag.tagId, updatedAt: now })
              .where(
                and(eq(personalBudgets.id, existing.budgetId), eq(personalBudgets.userId, user.id)),
              ) as unknown as BatchItem<'sqlite'>,
          );
        }
      }

      stmts.push(
        db
          .update(personalEvents)
          .set({
            tagId: syncedTag.tagId,
            startDate: nextStart,
            countsFrom: nextCountsFrom,
            updatedAt: now,
          })
          .where(and(eq(personalEvents.id, existing.id), eq(personalEvents.userId, user.id))) as unknown as BatchItem<'sqlite'>,
      );

      for (const batch of chunk(existingResult.sharesToMark, MARK_INSERT_CHUNK)) {
        stmts.push(
          db
            .insert(personalEventShareMarks)
            .values(
              batch.map((rootId) => ({
                userId: user.id,
                rootId,
                eventId: existing.id,
                state: 'skipped' as const,
              })),
            )
            .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
        );
      }

      return stmts;
    });

    const event: EventView = {
      ...existing,
      tagId: syncedTag.tagId,
      tagName: syncedTag.tagName,
      start: nextStart,
      countsFrom: nextCountsFrom,
    };

    return c.json({ event, existing: existingResult.existing }, 200);
  });

  app.delete('/me/personal/events/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const db = getDb(c.env);

    const existing = await db
      .select({
        id: personalEvents.id,
        budgetId: personalEvents.budgetId,
      })
      .from(personalEvents)
      .where(and(eq(personalEvents.id, id), eq(personalEvents.userId, user.id)))
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Event not found');
    }

    await commitPersonalWrite(db, user.id, () => {
      const stmts: BatchItem<'sqlite'>[] = [
        db
          .delete(personalEvents)
          .where(and(eq(personalEvents.id, existing.id), eq(personalEvents.userId, user.id))) as unknown as BatchItem<'sqlite'>,
      ];
      if (existing.budgetId) {
        stmts.push(
          db
            .delete(personalBudgets)
            .where(
              and(eq(personalBudgets.id, existing.budgetId), eq(personalBudgets.userId, user.id)),
            ) as unknown as BatchItem<'sqlite'>,
        );
      }
      return stmts;
    });

    return c.body(null, 204);
  });

  app.post('/me/personal/events/:id/existing', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.tag !== 'boolean') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    if (body.ownIds !== undefined && !Array.isArray(body.ownIds)) {
      throw new ApiError('VALIDATION', 422, 'Invalid ownIds');
    }
    if (body.shareRootIds !== undefined && !Array.isArray(body.shareRootIds)) {
      throw new ApiError('VALIDATION', 422, 'Invalid shareRootIds');
    }

    const rawOwnCount = Array.isArray(body.ownIds) ? body.ownIds.length : 0;
    const rawShareCount = Array.isArray(body.shareRootIds) ? body.shareRootIds.length : 0;
    if (rawOwnCount + rawShareCount > EXISTING_APPLY_MAX_IDS) {
      throw new ApiError('VALIDATION', 400, 'At most 200 ids per request');
    }

    const requestedOwnIds = Array.isArray(body.ownIds)
      ? Array.from(
          new Set(
            body.ownIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0),
          ),
        )
      : [];
    const requestedShareRootIds = Array.isArray(body.shareRootIds)
      ? Array.from(
          new Set(
            body.shareRootIds.filter(
              (x): x is string => typeof x === 'string' && x.trim().length > 0,
            ),
          ),
        )
      : [];

    const db = getDb(c.env);
    const existing = await db
      .select({
        id: personalEvents.id,
        tagId: personalEvents.tagId,
        startDate: personalEvents.startDate,
        endDate: personalEvents.endDate,
      })
      .from(personalEvents)
      .where(and(eq(personalEvents.id, id), eq(personalEvents.userId, user.id)))
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Event not found');
    }

    if (
      !body.tag ||
      !existing.tagId ||
      (requestedOwnIds.length === 0 && requestedShareRootIds.length === 0)
    ) {
      return c.json({ tagged: 0 }, 200);
    }

    const tagId = existing.tagId;
    const ownChunks = chunk(requestedOwnIds, ID_LOOKUP_CHUNK);
    const shareChunks = chunk(requestedShareRootIds, ID_LOOKUP_CHUNK);

    const [ownChunkResults, shareChunkResults] = await Promise.all([
      Promise.all(
        ownChunks.map((batch) =>
          db
            .select({ id: personalTransactions.id })
            .from(personalTransactions)
            .where(
              and(
                eq(personalTransactions.userId, user.id),
                eq(personalTransactions.type, 'expense'),
                eq(personalTransactions.source, 'manual'),
                gte(personalTransactions.date, existing.startDate),
                ...(existing.endDate !== null
                  ? [lte(personalTransactions.date, existing.endDate)]
                  : []),
                inArray(personalTransactions.id, batch),
                sql`NOT EXISTS (SELECT 1 FROM personal_transaction_tags WHERE transaction_id = ${personalTransactions.id} AND tag_id = ${tagId})`,
              ),
            )
            .all(),
        ),
      ),
      Promise.all(
        shareChunks.map((batch) =>
          db
            .select({ rootId: personalEventShareMarks.rootId })
            .from(personalEventShareMarks)
            .where(
              and(
                eq(personalEventShareMarks.userId, user.id),
                eq(personalEventShareMarks.eventId, existing.id),
                eq(personalEventShareMarks.state, 'skipped'),
                inArray(personalEventShareMarks.rootId, batch),
              ),
            )
            .all(),
        ),
      ),
    ]);

    const ownEntries = ownChunkResults.flat();
    const skippedMarks = shareChunkResults.flat();

    const skippedRootIds = skippedMarks.map((m) => m.rootId);
    const skippedShares: { rootId: string; tripId: string; tagId: string }[] = [];

    if (skippedRootIds.length > 0) {
      const groupRows = await loadCachedGroupRows(db, user.id);
      const tripByRoot = new Map<string, string>();
      for (const row of groupRows) {
        if (!tripByRoot.has(row.rootId)) {
          tripByRoot.set(row.rootId, row.tripId);
        }
      }
      for (const rootId of skippedRootIds) {
        const tripId = tripByRoot.get(rootId);
        if (tripId) {
          skippedShares.push({ rootId, tripId, tagId });
        }
      }
    }

    const ownIds = ownEntries.map((e) => e.id);
    const tagged = ownIds.length + skippedShares.length;

    if (tagged === 0) {
      return c.json({ tagged: 0 }, 200);
    }

    const now = nowIso();
    await commitPersonalWrite(db, user.id, (v) => {
      const stmts: BatchItem<'sqlite'>[] = [];

      for (const batch of chunk(ownIds, TX_TAG_CHUNK)) {
        stmts.push(
          db
            .insert(personalTransactionTags)
            .values(
              batch.map((transactionId) => ({
                transactionId,
                tagId,
              })),
            )
            .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
        );
      }

      for (const batch of chunk(ownIds, TX_UPDATE_CHUNK)) {
        stmts.push(
          db
            .update(personalTransactions)
            .set({ syncVersion: v as unknown as number, updatedAt: now })
            .where(
              and(
                eq(personalTransactions.userId, user.id),
                inArray(personalTransactions.id, batch),
              ),
            ) as unknown as BatchItem<'sqlite'>,
        );
      }

      if (skippedShares.length > 0) {
        const taggedRootIds = skippedShares.map((s) => s.rootId);
        for (const batch of chunk(taggedRootIds, MARK_UPDATE_CHUNK)) {
          stmts.push(
            db
              .update(personalEventShareMarks)
              .set({ state: 'tagged' })
              .where(
                and(
                  eq(personalEventShareMarks.userId, user.id),
                  eq(personalEventShareMarks.eventId, existing.id),
                  eq(personalEventShareMarks.state, 'skipped'),
                  inArray(personalEventShareMarks.rootId, batch),
                ),
              ) as unknown as BatchItem<'sqlite'>,
          );
        }
        stmts.push(...tagGroupSharesStatements(db, user.id, skippedShares, v, now));
      }

      return stmts;
    });

    return c.json({ tagged }, 200);
  });

  return app;
}
