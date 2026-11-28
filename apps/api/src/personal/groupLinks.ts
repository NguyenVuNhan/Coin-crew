import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import {
  participants,
  personalBalanceChecks,
  personalCategories,
  personalGroupLinkTags,
  personalGroupLinks,
  personalGroupSettings,
  personalTags,
  personalTransactions,
  personalEventShareMarks,
  personalWalletSettings,
  personalWallets,
  transactions,
  trips,
} from '@cc/api-db/schema';
import { commitPersonalWrite } from '@cc/api-db/personalSync';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';
import { eventForShare, type GroupLinkView, type GroupSettingsView } from '@cc/core';
import { ensureFixedCategories } from './fixedCategories';
import { computeGroupsKey, loadGroupSettings } from './groupShares';
import { loadCachedGroupRows } from './tripCache';
import { signedPersonalAmount, walletBalanceDeltaStmts } from './balanceCache';
import { loadUserEvents } from './events';
import { parseJson } from './validate';
import { loadCachedWalletsSummary } from './wallets';

const BALANCE_CHECK_GAP_MS = 24 * 60 * 60 * 1000;

export async function recordPersonalToggle(
  db: Db,
  userId: string,
  enabled: boolean,
  now: string,
): Promise<void> {
  if (!enabled) {
    await db
      .insert(personalGroupSettings)
      .values({
        userId,
        disabledAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: personalGroupSettings.userId,
        set: {
          disabledAt: now,
          updatedAt: now,
        },
      });
    return;
  }

  await db
    .insert(personalGroupSettings)
    .values({
      userId,
      disabledAt: null,
      reenabledAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: personalGroupSettings.userId,
      set: {
        reenabledAt: sql`CASE WHEN ${personalGroupSettings.disabledAt} IS NOT NULL THEN ${now} ELSE ${personalGroupSettings.reenabledAt} END`,
        updatedAt: now,
      },
    });
}

function parseOptionalId(v: unknown, field: string): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new ApiError('VALIDATION', 422, `Invalid ${field}`);
  }
  return v;
}

function parseIntent(v: unknown): 'shared' | 'loan' | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === 'shared' || v === 'loan') return v;
  throw new ApiError('VALIDATION', 422, 'Invalid intent');
}

function parseTagIds(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    throw new ApiError('VALIDATION', 422, 'Invalid tagIds');
  }
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid tagIds');
    }
    seen.add(item);
  }
  return Array.from(seen).sort();
}

export function groupLinkRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/personal/group-rows', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);
    const clientKey = c.req.query('key');
    const currentKey = await computeGroupsKey(db, user.id);

    if (clientKey !== undefined && clientKey === currentKey) {
      return c.json({ status: 'current' as const }, 200);
    }

    const rows = await loadCachedGroupRows(db, user.id);
    return c.json({ status: 'rows' as const, key: currentKey, rows }, 200);
  });

  app.put('/me/personal/group-links/:rootId', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const rootId = c.req.param('rootId');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const walletIdInput = parseOptionalId(body.walletId, 'walletId');
    const categoryIdInput = parseOptionalId(body.categoryId, 'categoryId');
    const tagIdsInput = parseTagIds(body.tagIds);
    const intentInput = parseIntent(body.intent);

    let excludeInput: boolean | undefined;
    if (body.excludeFromReports !== undefined) {
      if (typeof body.excludeFromReports !== 'boolean') {
        throw new ApiError('VALIDATION', 422, 'Invalid excludeFromReports');
      }
      excludeInput = body.excludeFromReports;
    }

    const db = getDb(c.env);

    const ownedTx = await db
      .select({ tripId: transactions.tripId, spentOn: transactions.spentOn })
      .from(transactions)
      .innerJoin(participants, eq(participants.tripId, transactions.tripId))
      .innerJoin(trips, eq(trips.id, transactions.tripId))
      .where(
        and(
          eq(transactions.rootId, rootId),
          eq(participants.userId, user.id),
          eq(participants.status, 'active'),
          isNull(trips.deleteAfter),
        ),
      )
      .orderBy(desc(transactions.isLatest))
      .limit(1)
      .get();

    if (!ownedTx) {
      throw new ApiError('NOT_FOUND', 404, 'Group transaction not found');
    }

    if (typeof walletIdInput === 'string') {
      const wallet = await db
        .select({
          id: personalWallets.id,
          currency: personalWallets.currency,
        })
        .from(personalWallets)
        .where(and(eq(personalWallets.id, walletIdInput), eq(personalWallets.userId, user.id)))
        .get();

      if (!wallet) {
        throw new ApiError('NOT_FOUND', 404, 'Wallet not found');
      }
      if (wallet.currency !== 'VND') {
        throw new ApiError('VALIDATION', 422, 'Wallet must be VND');
      }
    }

    if (typeof categoryIdInput === 'string') {
      const cat = await db
        .select({ id: personalCategories.id })
        .from(personalCategories)
        .where(and(eq(personalCategories.id, categoryIdInput), eq(personalCategories.userId, user.id)))
        .get();

      if (!cat) {
        throw new ApiError('NOT_FOUND', 404, 'Category not found');
      }
    }

    if (tagIdsInput && tagIdsInput.length > 0) {
      const foundTags = await db
        .select({ id: personalTags.id })
        .from(personalTags)
        .where(and(eq(personalTags.userId, user.id), inArray(personalTags.id, tagIdsInput)))
        .all();

      if (foundTags.length !== tagIdsInput.length) {
        throw new ApiError('NOT_FOUND', 404, 'Tag not found');
      }
    }

    const existing = await db
      .select({
        walletId: personalGroupLinks.walletId,
        categoryId: personalGroupLinks.categoryId,
        intent: personalGroupLinks.intent,
        excludeFromReports: personalGroupLinks.excludeFromReports,
      })
      .from(personalGroupLinks)
      .where(and(eq(personalGroupLinks.userId, user.id), eq(personalGroupLinks.rootId, rootId)))
      .get();

    const nextWalletId = walletIdInput !== undefined ? walletIdInput : (existing?.walletId ?? null);
    const nextCategoryId =
      categoryIdInput !== undefined ? categoryIdInput : (existing?.categoryId ?? null);
    const existingIntent =
      existing?.intent === 'shared' || existing?.intent === 'loan' ? existing.intent : null;
    const nextIntent = intentInput !== undefined ? intentInput : existingIntent;
    const nextExclude =
      excludeInput !== undefined ? excludeInput : existing?.excludeFromReports === 1;

    let nextTagIds: string[];
    let matchedEvent: { id: string; tagId: string } | null = null;
    if (tagIdsInput !== undefined) {
      nextTagIds = tagIdsInput;
      const events = await loadUserEvents(db, user.id);
      matchedEvent = eventForShare(events, { tripId: ownedTx.tripId, date: ownedTx.spentOn });
    } else {
      const existingTags = await db
        .select({ tagId: personalGroupLinkTags.tagId })
        .from(personalGroupLinkTags)
        .where(
          and(
            eq(personalGroupLinkTags.userId, user.id),
            eq(personalGroupLinkTags.rootId, rootId),
          ),
        )
        .all();
      nextTagIds = existingTags.map((t) => t.tagId).sort();
    }

    const now = nowIso();
    await commitPersonalWrite(db, user.id, (v) => {
      const stmts: BatchItem<'sqlite'>[] = [
        db
          .insert(personalGroupLinks)
          .values({
            userId: user.id,
            rootId,
            tripId: ownedTx.tripId,
            walletId: nextWalletId,
            categoryId: nextCategoryId,
            intent: nextIntent,
            excludeFromReports: nextExclude ? 1 : 0,
            createdAt: now,
            updatedAt: now,
            syncVersion: v as unknown as number,
          })
          .onConflictDoUpdate({
            target: [personalGroupLinks.userId, personalGroupLinks.rootId],
            set: {
              tripId: ownedTx.tripId,
              walletId: nextWalletId,
              categoryId: nextCategoryId,
              intent: nextIntent,
              excludeFromReports: nextExclude ? 1 : 0,
              updatedAt: now,
              syncVersion: v as unknown as number,
            },
          }) as unknown as BatchItem<'sqlite'>,
      ];

      if (tagIdsInput !== undefined) {
        stmts.push(
          db
            .delete(personalGroupLinkTags)
            .where(
              and(
                eq(personalGroupLinkTags.userId, user.id),
                eq(personalGroupLinkTags.rootId, rootId),
              ),
            ) as unknown as BatchItem<'sqlite'>,
        );
        for (const tagId of tagIdsInput) {
          stmts.push(
            db
              .insert(personalGroupLinkTags)
              .values({ userId: user.id, rootId, tagId }) as unknown as BatchItem<'sqlite'>,
          );
        }
        if (matchedEvent) {
          stmts.push(
            db
              .insert(personalEventShareMarks)
              .values({
                userId: user.id,
                rootId,
                eventId: matchedEvent.id,
                state: tagIdsInput.includes(matchedEvent.tagId) ? 'tagged' : 'skipped',
              })
              .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
          );
        }
      }

      return stmts;
    });

    const link: GroupLinkView = {
      walletId: nextWalletId,
      categoryId: nextCategoryId,
      tagIds: nextTagIds,
      intent: nextIntent,
      excludeFromReports: nextExclude,
    };

    return c.json({ link }, 200);
  });

  app.get('/me/personal/group-settings', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    await ensureFixedCategories(db, user.id);
    const settings = await loadGroupSettings(db, user.id);

    return c.json({ settings }, 200);
  });

  app.put('/me/personal/group-settings', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const defaultCategoryInput = parseOptionalId(
      body.defaultGroupCategoryId,
      'defaultGroupCategoryId',
    );

    let countLoansInput: boolean | undefined;
    if (body.countLoans !== undefined) {
      if (typeof body.countLoans !== 'boolean') {
        throw new ApiError('VALIDATION', 422, 'Invalid countLoans');
      }
      countLoansInput = body.countLoans;
    }

    const db = getDb(c.env);

    if (typeof defaultCategoryInput === 'string') {
      const cat = await db
        .select({ id: personalCategories.id })
        .from(personalCategories)
        .where(
          and(
            eq(personalCategories.id, defaultCategoryInput),
            eq(personalCategories.userId, user.id),
          ),
        )
        .get();

      if (!cat) {
        throw new ApiError('NOT_FOUND', 404, 'Category not found');
      }
    }

    const current = await loadGroupSettings(db, user.id);
    const nextDefaultCategoryId =
      defaultCategoryInput !== undefined ? defaultCategoryInput : current.defaultGroupCategoryId;
    const nextCountLoans =
      countLoansInput !== undefined ? countLoansInput : current.countLoans;

    const now = nowIso();
    await commitPersonalWrite(db, user.id, () => [
      db
        .insert(personalGroupSettings)
        .values({
          userId: user.id,
          defaultGroupCategoryId: nextDefaultCategoryId,
          countLoans: nextCountLoans ? 1 : 0,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: personalGroupSettings.userId,
          set: {
            defaultGroupCategoryId: nextDefaultCategoryId,
            countLoans: nextCountLoans ? 1 : 0,
            updatedAt: now,
          },
        }) as unknown as BatchItem<'sqlite'>,
    ]);

    const settings: GroupSettingsView = {
      defaultGroupCategoryId: nextDefaultCategoryId,
      countLoans: nextCountLoans,
    };

    return c.json({ settings }, 200);
  });

  app.get('/me/personal/balance-checks', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    const settings = await db
      .select({
        disabledAt: personalGroupSettings.disabledAt,
        reenabledAt: personalGroupSettings.reenabledAt,
      })
      .from(personalGroupSettings)
      .where(eq(personalGroupSettings.userId, user.id))
      .get();

    if (!settings?.disabledAt || !settings.reenabledAt) {
      return c.json({ walletIds: [] }, 200);
    }

    const gapMs = Date.parse(settings.reenabledAt) - Date.parse(settings.disabledAt);
    if (!(gapMs > BALANCE_CHECK_GAP_MS)) {
      return c.json({ walletIds: [] }, 200);
    }

    const [wallets, checks] = await Promise.all([
      db
        .select({ id: personalWallets.id })
        .from(personalWallets)
        .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
        .where(
          and(
            eq(personalWallets.userId, user.id),
            isNull(personalWalletSettings.archivedAt),
            or(isNull(personalWalletSettings.kind), eq(personalWalletSettings.kind, 'everyday')),
          ),
        )
        .orderBy(sql`coalesce(${personalWalletSettings.sortOrder}, 0) asc`, asc(personalWallets.createdAt))
        .all(),
      db
        .select({
          walletId: personalBalanceChecks.walletId,
          answeredAt: personalBalanceChecks.answeredAt,
        })
        .from(personalBalanceChecks)
        .where(eq(personalBalanceChecks.userId, user.id))
        .all(),
    ]);

    const reenabledMs = Date.parse(settings.reenabledAt);
    const answered = new Set<string>();
    for (const ch of checks) {
      const answeredMs = Date.parse(ch.answeredAt);
      if (
        Number.isFinite(answeredMs) && Number.isFinite(reenabledMs)
          ? answeredMs >= reenabledMs
          : ch.answeredAt >= settings.reenabledAt
      ) {
        answered.add(ch.walletId);
      }
    }

    const walletIds = wallets.filter((w) => !answered.has(w.id)).map((w) => w.id);
    return c.json({ walletIds }, 200);
  });

  app.post('/me/personal/wallets/:id/balance-check', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const walletId = c.req.param('id');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const hasSkip = body.skip === true;
    const hasActual = body.actual !== undefined;

    if (body.skip !== undefined && body.skip !== true) {
      throw new ApiError('VALIDATION', 422, 'Invalid skip');
    }
    if (hasSkip === hasActual) {
      throw new ApiError('VALIDATION', 422, 'Provide either actual or skip: true');
    }

    let actual: number | null = null;
    if (hasActual) {
      if (typeof body.actual !== 'number' || !Number.isSafeInteger(body.actual)) {
        throw new ApiError('VALIDATION', 422, 'actual must be an integer');
      }
      actual = body.actual;
    }

    const db = getDb(c.env);
    const now = nowIso();

    const upsertCheck = () =>
      db
        .insert(personalBalanceChecks)
        .values({
          userId: user.id,
          walletId,
          answeredAt: now,
        })
        .onConflictDoUpdate({
          target: [personalBalanceChecks.userId, personalBalanceChecks.walletId],
          set: { answeredAt: now },
        }) as unknown as BatchItem<'sqlite'>;

    if (hasSkip) {
      const walletRow = await db
        .select({ id: personalWallets.id })
        .from(personalWallets)
        .where(and(eq(personalWallets.id, walletId), eq(personalWallets.userId, user.id)))
        .get();

      if (!walletRow) {
        throw new ApiError('NOT_FOUND', 404, 'Wallet not found');
      }

      await commitPersonalWrite(db, user.id, () => [upsertCheck()]);
      return c.json({ entryId: null }, 200);
    }

    const { wallets, walletBalances } = await loadCachedWalletsSummary(db, user.id);
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) {
      throw new ApiError('NOT_FOUND', 404, 'Wallet not found');
    }

    const currentBalance = walletBalances.get(wallet.id) ?? wallet.startAmount;
    const diff = actual! - currentBalance;

    if (diff === 0) {
      await commitPersonalWrite(db, user.id, () => [upsertCheck()]);
      return c.json({ entryId: null }, 200);
    }

    const entryId = newId();
    const today = now.slice(0, 10);
    const type = diff > 0 ? 'income' : 'expense';
    const amount = Math.abs(diff);

    await commitPersonalWrite(db, user.id, (v) => [
      db.insert(personalTransactions).values({
        id: entryId,
        userId: user.id,
        walletId: wallet.id,
        type,
        amount,
        categoryId: null,
        transferId: null,
        assetId: null,
        quantity: null,
        date: today,
        time: null,
        note: 'Điều chỉnh số dư', // REVIEW
        excludeFromReports: 1,
        source: 'adjustment',
        createdAt: now,
        updatedAt: now,
        syncVersion: v as unknown as number,
      }) as unknown as BatchItem<'sqlite'>,
      upsertCheck(),
      ...walletBalanceDeltaStmts(
        db,
        user.id,
        [
          {
            walletId: wallet.id,
            netDelta: signedPersonalAmount(type, amount),
            countDelta: 1,
            needsReplay: wallet.currency !== 'VND' || wallet.kind === 'investment',
          },
        ],
        now,
      ),
    ]);

    return c.json({ entryId }, 200);
  });

  return app;
}
