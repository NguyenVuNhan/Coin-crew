import { Hono } from 'hono';
import { and, desc, eq, gte, inArray, isNull, lte, ne, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import {
  participants,
  personalBudgetLimits,
  personalBudgets,
  personalGroupLinkTags,
  personalGroupLinks,
  personalTags,
  personalTransactionTags,
  personalTransactions,
  personalTravelGroups,
  personalTravelShareMarks,
  personalTravels,
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
  findTravelOverlap,
  groupRowEffect,
  isCurrencyCode,
  type CurrencyCode,
  type TravelDef,
  type TravelExisting,
  type TravelLimitInput,
  type TravelView,
} from '@cc/core';
import { budgetCreateStatements, budgetMoveOnceStatements } from './budgets';
import { resolveTags } from './entries';
import { loadGroupSettings } from './groupShares';
import { loadCachedGroupRows } from './tripCache';
import { parseJson, requireDate } from './validate';

const LINK_UPSERT_CHUNK = 8;
const LINK_TAG_CHUNK = 25;
const MARK_INSERT_CHUNK = 20;
const MARK_UPDATE_CHUNK = 50;
const TX_TAG_CHUNK = 30;
const TX_UPDATE_CHUNK = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function parseTripName(v: unknown): string {
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

function parseLimit(v: unknown): TravelLimitInput {
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

function emptyExisting(): TravelExisting {
  return {
    own: { count: 0, totals: [] },
    shares: { count: 0, total: 0 },
  };
}

/**
 * Shared batch statements for tagging group shares: upserts `personal_group_links`
 * (bumping `sync_version` and `updated_at` while leaving existing fields untouched)
 * and inserts `personal_group_link_tags`. Reused by Task 5 (`POST /me/personal/travels/tag-shares`).
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

async function loadUserTravels(db: Db, userId: string): Promise<TravelView[]> {
  const [rows, groupRows] = await Promise.all([
    db
      .select({
        id: personalTravels.id,
        tagId: personalTravels.tagId,
        name: personalTags.name,
        startDate: personalTravels.startDate,
        endDate: personalTravels.endDate,
        countsFrom: personalTravels.countsFrom,
        budgetId: personalTravels.budgetId,
        createdAt: personalTravels.createdAt,
      })
      .from(personalTravels)
      .innerJoin(
        personalTags,
        and(eq(personalTags.id, personalTravels.tagId), eq(personalTags.userId, userId)),
      )
      .where(eq(personalTravels.userId, userId))
      .orderBy(desc(personalTravels.startDate), desc(personalTravels.createdAt))
      .all(),

    db
      .select({
        travelId: personalTravelGroups.travelId,
        tripId: personalTravelGroups.tripId,
      })
      .from(personalTravelGroups)
      .innerJoin(personalTravels, eq(personalTravels.id, personalTravelGroups.travelId))
      .where(eq(personalTravels.userId, userId))
      .all(),
  ]);

  const groupsByTravel = new Map<string, string[]>();
  for (const g of groupRows) {
    let list = groupsByTravel.get(g.travelId);
    if (!list) {
      list = [];
      groupsByTravel.set(g.travelId, list);
    }
    list.push(g.tripId);
  }

  return rows.map((r) => ({
    id: r.id,
    tagId: r.tagId,
    name: r.name,
    start: r.startDate,
    end: r.endDate,
    countsFrom: r.countsFrom,
    groupIds: groupsByTravel.get(r.id) ?? [],
    budgetId: r.budgetId ?? null,
    createdAt: r.createdAt,
  }));
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
    tagId: string;
    allTripTagIds: Set<string>;
    start: string;
    end: string;
    countsFrom: string;
    groupIds: string[];
  },
): Promise<{ existing: TravelExisting; sharesToMark: string[] }> {
  const ownRowsPromise = db
    .select({
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
        lte(personalTransactions.date, params.end),
        sql`NOT EXISTS (SELECT 1 FROM personal_transaction_tags WHERE transaction_id = ${personalTransactions.id} AND tag_id = ${params.tagId})`,
      ),
    )
    .all();

  const sharesPromise =
    params.groupIds.length > 0
      ? Promise.all([
          loadCachedGroupRows(db, userId),
          loadGroupSettings(db, userId),
          db
            .select({ rootId: personalTravelShareMarks.rootId })
            .from(personalTravelShareMarks)
            .where(eq(personalTravelShareMarks.userId, userId))
            .all(),
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
      if (row.date < params.countsFrom || row.date > params.end) continue;
      if (markedRootIds.has(row.rootId)) continue;
      if (row.link?.tagIds.some((tid) => params.allTripTagIds.has(tid))) continue;

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
    },
    sharesToMark,
  };
}

function assertNoOverlap(
  travels: TravelDef[],
  start: string,
  end: string,
  exceptId?: string,
): void {
  const overlap = findTravelOverlap(travels, start, end, exceptId);
  if (overlap) {
    throw new ApiError('TRAVEL_OVERLAP', 409, 'Trip dates overlap another trip', {
      details: {
        travelId: overlap.id,
        name: overlap.name,
        start: overlap.start,
        end: overlap.end,
      },
    });
  }
}

export function travelRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/personal/travels', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);
    const travels = await loadUserTravels(db, user.id);
    return c.json({ travels }, 200);
  });

  app.post('/me/personal/travels', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const name = parseTripName(body.name);
    const start = requireDate(body.start);
    const end = requireDate(body.end);
    const today = requireDate(body.today);
    const countsFrom =
      body.countsFrom !== undefined && body.countsFrom !== null
        ? requireDate(body.countsFrom)
        : defaultCountsFrom(start, today);

    if (countsFrom > start) {
      throw new ApiError('VALIDATION', 422, 'countsFrom must be on or before start');
    }
    if (start > end) {
      throw new ApiError('VALIDATION', 422, 'start must be on or before end');
    }

    const groupIds = parseGroupIds(body.groupIds);
    const limit =
      body.limit !== undefined && body.limit !== null ? parseLimit(body.limit) : null;

    const db = getDb(c.env);
    const now = nowIso();

    const [existingTravels, userTags] = await Promise.all([
      loadUserTravels(db, user.id),
      db
        .select({ id: personalTags.id, name: personalTags.name })
        .from(personalTags)
        .where(eq(personalTags.userId, user.id))
        .all(),
      assertActiveGroups(db, user.id, groupIds),
    ]);
    assertNoOverlap(existingTravels, start, end);

    const existingTag = userTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    let resolvedTag: { id: string; name: string };
    if (existingTag) {
      resolvedTag = existingTag;
    } else {
      const [tag] = await resolveTags(db, user.id, [name], now);
      if (tag) {
        resolvedTag = tag;
      } else {
        // SQLite's lower() is ASCII-only, so non-ASCII uppercase characters (e.g. 'Đ')
        // are inserted by resolveTags but missed by its lower() SELECT; fetch by exact name.
        const inserted = await db
          .select({ id: personalTags.id, name: personalTags.name })
          .from(personalTags)
          .where(and(eq(personalTags.userId, user.id), eq(personalTags.name, name)))
          .get();
        resolvedTag = inserted!;
      }
    }

    const allTripTagIds = new Set(existingTravels.map((t) => t.tagId));
    allTripTagIds.add(resolvedTag.id);

    const [excludedWalletIds, existingResult] = await Promise.all([
      limit ? loadDefaultExcludedWalletIds(db, user.id, limit.currency) : Promise.resolve([]),
      computeExisting(db, user.id, {
        tagId: resolvedTag.id,
        allTripTagIds,
        start,
        end,
        countsFrom,
        groupIds,
      }),
    ]);

    const id = newId();
    let budgetId: string | null = null;

    await commitPersonalWrite(db, user.id, (v) => {
      const stmts: BatchItem<'sqlite'>[] = [];

      if (limit) {
        const createdBudget = budgetCreateStatements(
          db,
          user.id,
          {
            name: resolvedTag.name,
            target: { kind: 'tag', tagId: resolvedTag.id },
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
        db.insert(personalTravels).values({
          id,
          userId: user.id,
          tagId: resolvedTag.id,
          startDate: start,
          endDate: end,
          countsFrom,
          budgetId,
          createdAt: now,
          updatedAt: now,
        }) as unknown as BatchItem<'sqlite'>,
      );

      if (groupIds.length > 0) {
        stmts.push(
          db.insert(personalTravelGroups).values(
            groupIds.map((tripId) => ({
              travelId: id,
              tripId,
            })),
          ) as unknown as BatchItem<'sqlite'>,
        );
      }

      for (const batch of chunk(existingResult.sharesToMark, MARK_INSERT_CHUNK)) {
        stmts.push(
          db
            .insert(personalTravelShareMarks)
            .values(
              batch.map((rootId) => ({
                userId: user.id,
                rootId,
                travelId: id,
                state: 'skipped' as const,
              })),
            )
            .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
        );
      }

      return stmts;
    });

    const travel: TravelView = {
      id,
      tagId: resolvedTag.id,
      name: resolvedTag.name,
      start,
      end,
      countsFrom,
      groupIds,
      budgetId,
      createdAt: now,
    };

    return c.json({ travel, existing: existingResult.existing }, 201);
  });

  app.patch('/me/personal/travels/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const today = requireDate(body.today);
    if (body.endNow !== undefined && body.endNow !== true) {
      throw new ApiError('VALIDATION', 422, 'Invalid endNow');
    }
    const endNow = body.endNow === true;

    const nameInput = body.name !== undefined ? parseTripName(body.name) : undefined;
    const startInput = body.start !== undefined ? requireDate(body.start) : undefined;
    const endInput = body.end !== undefined ? requireDate(body.end) : undefined;
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
    const allTravels = await loadUserTravels(db, user.id);
    const existing = allTravels.find((t) => t.id === id);
    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Trip not found');
    }

    let nextStart = startInput ?? existing.start;
    let nextEnd = endInput ?? existing.end;
    let nextCountsFrom = countsFromInput ?? existing.countsFrom;

    if (endNow) {
      nextEnd = today;
      if (nextStart > today) {
        nextStart = today;
      }
      if (nextCountsFrom > nextStart) {
        nextCountsFrom = nextStart;
      }
    }

    if (nextCountsFrom > nextStart) {
      throw new ApiError('VALIDATION', 422, 'countsFrom must be on or before start');
    }
    if (nextStart > nextEnd) {
      throw new ApiError('VALIDATION', 422, 'start must be on or before end');
    }

    const startOrEndChanged = nextStart !== existing.start || nextEnd !== existing.end;
    const budgetRangeChanged =
      nextCountsFrom !== existing.countsFrom || nextEnd !== existing.end;
    const datesChanged = startOrEndChanged || nextCountsFrom !== existing.countsFrom;

    if (startOrEndChanged) {
      assertNoOverlap(allTravels, nextStart, nextEnd, existing.id);
    }

    const nextGroupIds = groupIdsInput ?? existing.groupIds;
    const groupsChanged =
      groupIdsInput !== undefined && !sameStringSet(existing.groupIds, groupIdsInput);

    const nextName = nameInput ?? existing.name;
    const nameChanged = nameInput !== undefined && nameInput !== existing.name;

    await Promise.all([
      groupIdsInput ? assertActiveGroups(db, user.id, groupIdsInput) : Promise.resolve(),
      nameChanged
        ? (async () => {
            const tags = await db
              .select({ id: personalTags.id, name: personalTags.name })
              .from(personalTags)
              .where(and(eq(personalTags.userId, user.id), ne(personalTags.id, existing.tagId)))
              .all();
            const lowerNext = nextName.toLowerCase();
            if (tags.some((t) => t.name.toLowerCase() === lowerNext)) {
              throw new ApiError('TAG_TAKEN', 409, 'Tag name is already taken');
            }
          })()
        : Promise.resolve(),
    ]);

    const creatingBudget =
      limitInput !== undefined && limitInput !== null && existing.budgetId === null;
    const allTripTagIds = new Set(allTravels.map((t) => t.tagId));
    allTripTagIds.add(existing.tagId);
    const removedGroupIds = groupsChanged
      ? existing.groupIds.filter((gid) => !nextGroupIds.includes(gid))
      : [];

    const [excludedWalletIds, existingResult] = await Promise.all([
      creatingBudget
        ? loadDefaultExcludedWalletIds(db, user.id, limitInput.currency)
        : Promise.resolve([]),
      datesChanged || groupsChanged
        ? computeExisting(db, user.id, {
            tagId: existing.tagId,
            allTripTagIds,
            start: nextStart,
            end: nextEnd,
            countsFrom: nextCountsFrom,
            groupIds: nextGroupIds,
          })
        : Promise.resolve({ existing: emptyExisting(), sharesToMark: [] }),
    ]);

    const now = nowIso();
    let nextBudgetId = existing.budgetId;

    await commitPersonalWrite(db, user.id, (v) => {
      const stmts: BatchItem<'sqlite'>[] = [];

      if (nameChanged) {
        stmts.push(
          db
            .update(personalTags)
            .set({ name: nextName })
            .where(and(eq(personalTags.id, existing.tagId), eq(personalTags.userId, user.id))) as unknown as BatchItem<'sqlite'>,
        );
      }

      if (limitInput === null) {
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
      } else if (limitInput !== undefined) {
        if (existing.budgetId === null) {
          const createdBudget = budgetCreateStatements(
            db,
            user.id,
            {
              name: nextName,
              target: { kind: 'tag', tagId: existing.tagId },
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
          stmts.push(
            db
              .update(personalBudgets)
              .set({
                name: nextName,
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
      } else if (existing.budgetId !== null) {
        if (budgetRangeChanged) {
          stmts.push(
            ...budgetMoveOnceStatements(db, existing.budgetId, nextCountsFrom, nextEnd, now),
          );
        }
        if (nameChanged) {
          stmts.push(
            db
              .update(personalBudgets)
              .set({ name: nextName, updatedAt: now })
              .where(
                and(eq(personalBudgets.id, existing.budgetId), eq(personalBudgets.userId, user.id)),
              ) as unknown as BatchItem<'sqlite'>,
          );
        }
      }

      stmts.push(
        db
          .update(personalTravels)
          .set({
            startDate: nextStart,
            endDate: nextEnd,
            countsFrom: nextCountsFrom,
            budgetId: nextBudgetId,
            updatedAt: now,
          })
          .where(and(eq(personalTravels.id, existing.id), eq(personalTravels.userId, user.id))) as unknown as BatchItem<'sqlite'>,
      );

      if (groupsChanged) {
        stmts.push(
          db
            .delete(personalTravelGroups)
            .where(eq(personalTravelGroups.travelId, existing.id)) as unknown as BatchItem<'sqlite'>,
        );
        if (nextGroupIds.length > 0) {
          stmts.push(
            db.insert(personalTravelGroups).values(
              nextGroupIds.map((tripId) => ({
                travelId: existing.id,
                tripId,
              })),
            ) as unknown as BatchItem<'sqlite'>,
          );
        }
        if (removedGroupIds.length > 0) {
          stmts.push(
            db
              .delete(personalTravelShareMarks)
              .where(
                and(
                  eq(personalTravelShareMarks.userId, user.id),
                  eq(personalTravelShareMarks.travelId, existing.id),
                  eq(personalTravelShareMarks.state, 'skipped'),
                  sql`${personalTravelShareMarks.rootId} IN (SELECT root_id FROM transactions WHERE is_latest = 1 AND trip_id IN (${sql.join(
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
            .insert(personalTravelShareMarks)
            .values(
              batch.map((rootId) => ({
                userId: user.id,
                rootId,
                travelId: existing.id,
                state: 'skipped' as const,
              })),
            )
            .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
        );
      }

      return stmts;
    });

    const travel: TravelView = {
      id: existing.id,
      tagId: existing.tagId,
      name: nextName,
      start: nextStart,
      end: nextEnd,
      countsFrom: nextCountsFrom,
      groupIds: nextGroupIds,
      budgetId: nextBudgetId,
      createdAt: existing.createdAt,
    };

    return c.json({ travel, existing: existingResult.existing }, 200);
  });

  app.delete('/me/personal/travels/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const db = getDb(c.env);

    const existing = await db
      .select({
        id: personalTravels.id,
        budgetId: personalTravels.budgetId,
      })
      .from(personalTravels)
      .where(and(eq(personalTravels.id, id), eq(personalTravels.userId, user.id)))
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Trip not found');
    }

    await commitPersonalWrite(db, user.id, () => {
      const stmts: BatchItem<'sqlite'>[] = [
        db
          .delete(personalTravels)
          .where(and(eq(personalTravels.id, existing.id), eq(personalTravels.userId, user.id))) as unknown as BatchItem<'sqlite'>,
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

  app.post('/me/personal/travels/:id/existing', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.tag !== 'boolean') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const db = getDb(c.env);
    const existing = await db
      .select({
        id: personalTravels.id,
        tagId: personalTravels.tagId,
        startDate: personalTravels.startDate,
        endDate: personalTravels.endDate,
      })
      .from(personalTravels)
      .where(and(eq(personalTravels.id, id), eq(personalTravels.userId, user.id)))
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Trip not found');
    }

    if (!body.tag) {
      return c.json({ tagged: 0 }, 200);
    }

    const [ownEntries, skippedMarks] = await Promise.all([
      db
        .select({ id: personalTransactions.id })
        .from(personalTransactions)
        .where(
          and(
            eq(personalTransactions.userId, user.id),
            eq(personalTransactions.type, 'expense'),
            eq(personalTransactions.source, 'manual'),
            gte(personalTransactions.date, existing.startDate),
            lte(personalTransactions.date, existing.endDate),
            sql`NOT EXISTS (SELECT 1 FROM personal_transaction_tags WHERE transaction_id = ${personalTransactions.id} AND tag_id = ${existing.tagId})`,
          ),
        )
        .all(),
      db
        .select({ rootId: personalTravelShareMarks.rootId })
        .from(personalTravelShareMarks)
        .where(
          and(
            eq(personalTravelShareMarks.userId, user.id),
            eq(personalTravelShareMarks.travelId, existing.id),
            eq(personalTravelShareMarks.state, 'skipped'),
          ),
        )
        .all(),
    ]);

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
          skippedShares.push({ rootId, tripId, tagId: existing.tagId });
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
                tagId: existing.tagId,
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
              .update(personalTravelShareMarks)
              .set({ state: 'tagged' })
              .where(
                and(
                  eq(personalTravelShareMarks.userId, user.id),
                  eq(personalTravelShareMarks.travelId, existing.id),
                  eq(personalTravelShareMarks.state, 'skipped'),
                  inArray(personalTravelShareMarks.rootId, batch),
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
