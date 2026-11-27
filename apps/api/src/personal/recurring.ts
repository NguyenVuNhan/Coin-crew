import { Hono } from 'hono';
import { and, asc, eq, like, ne } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import {
  personalPlannedItems,
  personalRecurringRules,
  personalRecurringRuleTags,
  personalTags,
  personalTransactions,
  personalTransactionTags,
} from '@cc/api-db/schema';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';
import {
  isValidAmount,
  nextOccurrenceAfter,
  vnDate,
  type RecurringDraft,
  type RecurringRuleView,
  type RecurringSchedule,
  type RecurringType,
  type RepeatEnd,
  type RepeatUnit,
} from '@cc/core';
import { parseEntryInput } from './entryInput';
import {
  loadWalletsMap,
  requireAsset,
  requireCategory,
  resolveTags,
  resolveTransferAmounts,
} from './entryWrite';
import { applyRule } from './recurringApply';
import { parseJson, requireDate } from './validate';

const REPEAT_UNITS: readonly RepeatUnit[] = ['day', 'week', 'month', 'year'];
const RECURRING_TYPES: readonly RecurringType[] = ['expense', 'income', 'transfer', 'buy'];
const INLINE_STATEMENT_BUDGET = 35 // the create route has used ~8 queries before the inline run; stay under 50;

function subtractOneDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! - 1));
  const yy = String(dt.getUTCFullYear()).padStart(4, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function parseSchedule(v: unknown): RecurringSchedule {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new ApiError('VALIDATION', 422, 'Invalid schedule');
  }
  const obj = v as Record<string, unknown>;

  if (typeof obj.unit !== 'string' || !(REPEAT_UNITS as readonly string[]).includes(obj.unit)) {
    throw new ApiError('VALIDATION', 422, 'Invalid schedule unit');
  }
  const unit = obj.unit as RepeatUnit;

  if (typeof obj.every !== 'number' || !Number.isSafeInteger(obj.every) || obj.every < 1) {
    throw new ApiError('VALIDATION', 422, 'Invalid schedule every');
  }
  const every = obj.every;
  const startDate = requireDate(obj.startDate);

  let weekdays: number[] | undefined;
  if (obj.weekdays !== undefined && obj.weekdays !== null) {
    if (!Array.isArray(obj.weekdays) || obj.weekdays.length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid schedule weekdays');
    }
    const set = new Set<number>();
    for (const wd of obj.weekdays) {
      if (typeof wd !== 'number' || !Number.isInteger(wd) || wd < 1 || wd > 7) {
        throw new ApiError('VALIDATION', 422, 'Invalid schedule weekday');
      }
      set.add(wd);
    }
    weekdays = [...set].sort((a, b) => a - b);
  }

  let monthDay: number | 'last' | undefined;
  if (obj.monthDay !== undefined && obj.monthDay !== null) {
    if (obj.monthDay === 'last') {
      monthDay = 'last';
    } else if (
      typeof obj.monthDay === 'number' &&
      Number.isInteger(obj.monthDay) &&
      obj.monthDay >= 1 &&
      obj.monthDay <= 31
    ) {
      monthDay = obj.monthDay;
    } else {
      throw new ApiError('VALIDATION', 422, 'Invalid schedule monthDay');
    }
  }

  if (!obj.end || typeof obj.end !== 'object' || Array.isArray(obj.end)) {
    throw new ApiError('VALIDATION', 422, 'Invalid schedule end');
  }
  const endObj = obj.end as Record<string, unknown>;
  let end: RepeatEnd;
  if (endObj.kind === 'never') {
    end = { kind: 'never' };
  } else if (endObj.kind === 'count') {
    if (
      typeof endObj.count !== 'number' ||
      !Number.isSafeInteger(endObj.count) ||
      endObj.count < 1
    ) {
      throw new ApiError('VALIDATION', 422, 'Invalid schedule end count');
    }
    end = { kind: 'count', count: endObj.count };
  } else if (endObj.kind === 'date') {
    end = { kind: 'date', date: requireDate(endObj.date) };
  } else {
    throw new ApiError('VALIDATION', 422, 'Invalid schedule end kind');
  }

  return {
    unit,
    every,
    ...(weekdays !== undefined ? { weekdays } : {}),
    ...(monthDay !== undefined ? { monthDay } : {}),
    startDate,
    end,
  };
}

function parseDraft(v: unknown, startDate: string): RecurringDraft {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new ApiError('VALIDATION', 422, 'Invalid draft');
  }
  const obj = v as Record<string, unknown>;

  if (typeof obj.type !== 'string' || !(RECURRING_TYPES as readonly string[]).includes(obj.type)) {
    throw new ApiError('VALIDATION', 422, 'Invalid draft type');
  }
  const type = obj.type as RecurringType;

  if (type === 'expense' || type === 'income') {
    const parsed = parseEntryInput({
      type,
      walletId: obj.walletId,
      categoryId: obj.categoryId,
      amount: obj.amount,
      date: startDate,
      note: obj.note,
      tags: obj.tags,
      excludeFromReports: obj.excludeFromReports,
    });
    if (parsed.type !== 'expense' && parsed.type !== 'income') {
      throw new ApiError('VALIDATION', 422, 'Invalid draft');
    }
    return {
      type: parsed.type,
      walletId: parsed.walletId,
      categoryId: parsed.categoryId,
      amount: parsed.amount,
      tags: parsed.tags ?? [],
      note: parsed.note ?? null,
      excludeFromReports: parsed.excludeFromReports ?? false,
    };
  }

  if (type === 'transfer') {
    const parsed = parseEntryInput({
      type: 'transfer',
      fromWalletId: obj.walletId,
      toWalletId: obj.toWalletId,
      amountSent: obj.amount,
      amountReceived: obj.amountReceived,
      date: startDate,
      note: obj.note,
      tags: obj.tags,
      excludeFromReports: obj.excludeFromReports,
    });
    if (parsed.type !== 'transfer') {
      throw new ApiError('VALIDATION', 422, 'Invalid draft');
    }
    return {
      type: 'transfer',
      walletId: parsed.fromWalletId,
      toWalletId: parsed.toWalletId,
      amount: parsed.amountSent,
      ...(parsed.amountReceived !== undefined ? { amountReceived: parsed.amountReceived } : {}),
      tags: parsed.tags ?? [],
      note: parsed.note ?? null,
      excludeFromReports: parsed.excludeFromReports ?? true,
    };
  }

  // buy: validate with a placeholder quantity (quantity is never stored on a buy rule)
  const parsed = parseEntryInput({
    type: 'buy',
    walletId: obj.walletId,
    assetId: obj.assetId,
    amount: obj.amount,
    quantity: 1,
    date: startDate,
    note: obj.note,
    tags: obj.tags,
  });
  if (parsed.type !== 'buy') {
    throw new ApiError('VALIDATION', 422, 'Invalid draft');
  }
  return {
    type: 'buy',
    walletId: parsed.walletId,
    assetId: parsed.assetId,
    amount: parsed.amount,
    tags: parsed.tags ?? [],
    note: parsed.note ?? null,
  };
}

async function validateDraftRefs(db: Db, userId: string, draft: RecurringDraft): Promise<void> {
  if (draft.type === 'expense' || draft.type === 'income') {
    const wallets = await loadWalletsMap(db, userId, [draft.walletId]);
    const wallet = wallets.get(draft.walletId)!;
    if (!isValidAmount(draft.amount, wallet.currency)) {
      throw new ApiError('VALIDATION', 422, 'Invalid amount');
    }
    await requireCategory(db, userId, draft.categoryId!, draft.type, false);
    return;
  }

  if (draft.type === 'transfer') {
    const wallets = await loadWalletsMap(db, userId, [draft.walletId, draft.toWalletId!]);
    const fromWallet = wallets.get(draft.walletId)!;
    const toWallet = wallets.get(draft.toWalletId!)!;
    resolveTransferAmounts(
      draft.amount,
      draft.amountReceived,
      fromWallet.currency,
      toWallet.currency,
    );
    return;
  }

  // buy
  const wallets = await loadWalletsMap(db, userId, [draft.walletId]);
  const wallet = wallets.get(draft.walletId)!;
  if (wallet.kind !== 'investment') {
    throw new ApiError('VALIDATION', 422, 'Wallet must be an investment wallet');
  }
  if (!isValidAmount(draft.amount, wallet.currency)) {
    throw new ApiError('VALIDATION', 422, 'Invalid amount');
  }
  await requireAsset(db, userId, draft.assetId!, false);
}

function serializeDraftWithoutTags(draft: RecurringDraft): string {
  const { tags: _tags, ...rest } = draft;
  return JSON.stringify(rest);
}

type RuleRow = typeof personalRecurringRules.$inferSelect;

function toRuleView(row: RuleRow, tags: string[]): RecurringRuleView {
  const rawDraft = JSON.parse(row.draft) as Omit<RecurringDraft, 'tags'>;
  const schedule = JSON.parse(row.schedule) as RecurringSchedule;
  return {
    id: row.id,
    draft: { ...rawDraft, tags },
    schedule,
    askMe: Boolean(row.askMe),
    status: row.status as RecurringRuleView['status'],
    pausedReason: (row.pausedReason ?? null) as RecurringRuleView['pausedReason'],
    nextDueOn: row.nextDueOn ?? null,
    lastConfirmedOn: row.lastConfirmedOn,
  };
}

function extractDateFromRef(ref: string | null, ruleId: string): string | null {
  if (!ref) return null;
  const prefix = `${ruleId}:`;
  if (!ref.startsWith(prefix)) return null;
  const datePart = ref.slice(prefix.length, prefix.length + 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
}

export function resumeRuleStmts(
  db: Db,
  userId: string,
  ruleId: string,
  schedule: RecurringSchedule,
  today: string,
  now: string,
): {
  nextDueOn: string | null;
  nextStatus: RecurringRuleView['status'];
  stmts: BatchItem<'sqlite'>[];
} {
  const nextDueOn = nextOccurrenceAfter(schedule, today);
  const nextStatus: RecurringRuleView['status'] = nextDueOn === null ? 'ended' : 'active';
  const stmts: BatchItem<'sqlite'>[] = [
    db
      .update(personalRecurringRules)
      .set({
        status: nextStatus,
        pausedReason: null,
        nextDueOn,
        lastConfirmedOn: today,
        updatedAt: now,
      })
      .where(and(eq(personalRecurringRules.id, ruleId), eq(personalRecurringRules.userId, userId))),
    db
      .update(personalPlannedItems)
      .set({ status: 'dismissed', resolvedAt: now })
      .where(
        and(
          eq(personalPlannedItems.userId, userId),
          eq(personalPlannedItems.ruleId, ruleId),
          eq(personalPlannedItems.kind, 'recurring_paused'),
          eq(personalPlannedItems.status, 'waiting'),
        ),
      ),
    db
      .update(personalPlannedItems)
      .set({ status: 'confirmed', resolvedAt: now })
      .where(
        and(
          eq(personalPlannedItems.userId, userId),
          eq(personalPlannedItems.ruleId, ruleId),
          eq(personalPlannedItems.kind, 'recurring_checkin'),
          eq(personalPlannedItems.status, 'waiting'),
        ),
      ),
  ];
  return { nextDueOn, nextStatus, stmts };
}

export function recurringRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // Query cost: 2 (rules + tags)
  app.get('/me/personal/recurring/rules', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    const [ruleRows, tagRows] = await Promise.all([
      db
        .select()
        .from(personalRecurringRules)
        .where(eq(personalRecurringRules.userId, user.id))
        .orderBy(asc(personalRecurringRules.createdAt))
        .all(),
      db
        .select({
          ruleId: personalRecurringRuleTags.ruleId,
          name: personalTags.name,
        })
        .from(personalRecurringRuleTags)
        .innerJoin(
          personalRecurringRules,
          eq(personalRecurringRules.id, personalRecurringRuleTags.ruleId),
        )
        .innerJoin(personalTags, eq(personalTags.id, personalRecurringRuleTags.tagId))
        .where(eq(personalRecurringRules.userId, user.id))
        .all(),
    ]);

    const tagsByRule = new Map<string, string[]>();
    for (const t of tagRows) {
      let list = tagsByRule.get(t.ruleId);
      if (!list) {
        list = [];
        tagsByRule.set(t.ruleId, list);
      }
      list.push(t.name);
    }

    const rules = ruleRows.map((row) => toRuleView(row, tagsByRule.get(row.id) ?? []));
    return c.json({ rules }, 200);
  });

  // Query cost: <= 8 + inline applyRule's batch
  app.post('/me/personal/recurring/rules', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const schedule = parseSchedule(body.schedule);
    const draft = parseDraft(body.draft, schedule.startDate);

    if (body.askMe !== undefined && typeof body.askMe !== 'boolean') {
      throw new ApiError('VALIDATION', 422, 'Invalid askMe');
    }
    const askMe = draft.type === 'buy' ? true : Boolean(body.askMe);

    const db = getDb(c.env);
    await validateDraftRefs(db, user.id, draft);

    const nowDate = new Date();
    const today = vnDate(nowDate);
    const now = nowDate.toISOString();
    const id = newId();

    const resolvedTags = await resolveTags(db, user.id, draft.tags, now);
    const canonicalDraft: RecurringDraft = {
      ...draft,
      tags: resolvedTags.map((t) => t.name),
    };

    const insertStmts: BatchItem<'sqlite'>[] = [
      db.insert(personalRecurringRules).values({
        id,
        userId: user.id,
        type: canonicalDraft.type,
        draft: serializeDraftWithoutTags(canonicalDraft),
        schedule: JSON.stringify(schedule),
        askMe: askMe ? 1 : 0,
        status: 'active',
        pausedReason: null,
        nextDueOn: schedule.startDate,
        lastConfirmedOn: today,
        createdAt: now,
        updatedAt: now,
      }),
    ];

    if (resolvedTags.length > 0) {
      insertStmts.push(
        db.insert(personalRecurringRuleTags).values(
          resolvedTags.map((t) => ({
            ruleId: id,
            tagId: t.id,
          })),
        ),
      );
    }

    await db.batch(insertStmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

    await applyRule(db, user.id, id, today, INLINE_STATEMENT_BUDGET);

    const updated = await db
      .select()
      .from(personalRecurringRules)
      .where(and(eq(personalRecurringRules.id, id), eq(personalRecurringRules.userId, user.id)))
      .get();

    const rule = toRuleView(updated!, canonicalDraft.tags);
    return c.json({ rule }, 201);
  });

  // Query cost: <= 6
  app.post('/me/personal/recurring/rules/from/:transactionId', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const transactionId = c.req.param('transactionId');
    const db = getDb(c.env);

    const [tx, txTagRows] = await Promise.all([
      db
        .select()
        .from(personalTransactions)
        .where(
          and(
            eq(personalTransactions.id, transactionId),
            eq(personalTransactions.userId, user.id),
          ),
        )
        .get(),
      db
        .select({
          tagId: personalTransactionTags.tagId,
          name: personalTags.name,
        })
        .from(personalTransactionTags)
        .innerJoin(personalTags, eq(personalTags.id, personalTransactionTags.tagId))
        .where(eq(personalTransactionTags.transactionId, transactionId))
        .all(),
    ]);

    if (!tx) {
      throw new ApiError('NOT_FOUND', 404, 'Transaction not found');
    }
    if (tx.type === 'sell') {
      throw new ApiError('VALIDATION', 422, 'Sell transactions cannot be repeated');
    }

    let draft: RecurringDraft;
    const tagNames = txTagRows.map((t) => t.name);

    if (tx.type === 'expense' || tx.type === 'income') {
      if (!tx.categoryId) {
        throw new ApiError('VALIDATION', 422, 'Transaction has no category');
      }
      draft = {
        type: tx.type,
        walletId: tx.walletId,
        categoryId: tx.categoryId,
        amount: tx.amount,
        tags: tagNames,
        note: tx.note ?? null,
        excludeFromReports: Boolean(tx.excludeFromReports),
      };
    } else if (tx.type === 'buy') {
      if (!tx.assetId) {
        throw new ApiError('VALIDATION', 422, 'Transaction has no asset');
      }
      draft = {
        type: 'buy',
        walletId: tx.walletId,
        assetId: tx.assetId,
        amount: tx.amount,
        tags: tagNames,
        note: tx.note ?? null,
      };
    } else {
      // transfer_out or transfer_in
      if (!tx.transferId) {
        throw new ApiError('VALIDATION', 422, 'Invalid transfer transaction');
      }
      const pair = await db
        .select()
        .from(personalTransactions)
        .where(
          and(
            eq(personalTransactions.userId, user.id),
            eq(personalTransactions.transferId, tx.transferId),
          ),
        )
        .all();
      const outRow = pair.find((r) => r.type === 'transfer_out');
      const inRow = pair.find((r) => r.type === 'transfer_in');
      if (!outRow || !inRow) {
        throw new ApiError('VALIDATION', 422, 'Incomplete transfer pair');
      }
      draft = {
        type: 'transfer',
        walletId: outRow.walletId,
        toWalletId: inRow.walletId,
        amount: outRow.amount,
        ...(inRow.amount !== outRow.amount ? { amountReceived: inRow.amount } : {}),
        tags: tagNames,
        note: outRow.note ?? null,
        excludeFromReports: Boolean(outRow.excludeFromReports),
      };
    }

    const monthDay = Number(tx.date.slice(8, 10));
    const seedSchedule: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay,
      startDate: tx.date,
      end: { kind: 'never' },
    };
    const startDate = nextOccurrenceAfter(seedSchedule, tx.date)!;
    const schedule: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay,
      startDate,
      end: { kind: 'never' },
    };

    const askMe = draft.type === 'buy';
    const nowDate = new Date();
    const today = vnDate(nowDate);
    const now = nowDate.toISOString();
    const id = newId();

    const insertStmts: BatchItem<'sqlite'>[] = [
      db.insert(personalRecurringRules).values({
        id,
        userId: user.id,
        type: draft.type,
        draft: serializeDraftWithoutTags(draft),
        schedule: JSON.stringify(schedule),
        askMe: askMe ? 1 : 0,
        status: 'active',
        pausedReason: null,
        nextDueOn: startDate,
        lastConfirmedOn: today,
        createdAt: now,
        updatedAt: now,
      }),
    ];

    if (txTagRows.length > 0) {
      insertStmts.push(
        db.insert(personalRecurringRuleTags).values(
          txTagRows.map((t) => ({
            ruleId: id,
            tagId: t.tagId,
          })),
        ),
      );
    }

    await db.batch(insertStmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

    const rule: RecurringRuleView = {
      id,
      draft,
      schedule,
      askMe,
      status: 'active',
      pausedReason: null,
      nextDueOn: startDate,
      lastConfirmedOn: today,
    };

    return c.json({ rule }, 201);
  });

  // Query cost: <= 6
  app.patch('/me/personal/recurring/rules/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const db = getDb(c.env);
    const [existing, existingTagRows] = await Promise.all([
      db
        .select()
        .from(personalRecurringRules)
        .where(and(eq(personalRecurringRules.id, id), eq(personalRecurringRules.userId, user.id)))
        .get(),
      db
        .select({ name: personalTags.name })
        .from(personalRecurringRuleTags)
        .innerJoin(personalTags, eq(personalTags.id, personalRecurringRuleTags.tagId))
        .where(eq(personalRecurringRuleTags.ruleId, id))
        .all(),
    ]);

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Rule not found');
    }

    const currentSchedule = JSON.parse(existing.schedule) as RecurringSchedule;
    const currentRawDraft = JSON.parse(existing.draft) as Omit<RecurringDraft, 'tags'>;
    const currentDraft: RecurringDraft = {
      ...currentRawDraft,
      tags: existingTagRows.map((t) => t.name),
    };

    const scheduleChanged = body.schedule !== undefined;
    const nextSchedule = scheduleChanged ? parseSchedule(body.schedule) : currentSchedule;

    const draftChanged = body.draft !== undefined;
    let nextDraft = draftChanged
      ? parseDraft(body.draft, nextSchedule.startDate)
      : currentDraft;

    if (body.askMe !== undefined && typeof body.askMe !== 'boolean') {
      throw new ApiError('VALIDATION', 422, 'Invalid askMe');
    }
    const nextAskMe =
      nextDraft.type === 'buy'
        ? true
        : body.askMe !== undefined
          ? body.askMe
          : Boolean(existing.askMe);

    if (draftChanged) {
      await validateDraftRefs(db, user.id, nextDraft);
    }

    const nowDate = new Date();
    const today = vnDate(nowDate);
    const now = nowDate.toISOString();

    let resolvedTags: { id: string; name: string }[] | null = null;
    if (draftChanged) {
      resolvedTags = await resolveTags(db, user.id, nextDraft.tags, now);
      nextDraft = { ...nextDraft, tags: resolvedTags.map((t) => t.name) };
    }

    let nextDueOn = existing.nextDueOn ?? null;
    if (scheduleChanged) {
      const [txRefs, plannedRefs] = await Promise.all([
        db
          .select({ externalRef: personalTransactions.externalRef })
          .from(personalTransactions)
          .where(
            and(
              eq(personalTransactions.userId, user.id),
              eq(personalTransactions.source, 'recurring'),
              like(personalTransactions.externalRef, `${id}:%`),
              ne(personalTransactions.type, 'transfer_in'),
            ),
          )
          .all(),
        db
          .select({ refKey: personalPlannedItems.refKey })
          .from(personalPlannedItems)
          .where(
            and(
              eq(personalPlannedItems.userId, user.id),
              eq(personalPlannedItems.ruleId, id),
              eq(personalPlannedItems.kind, 'recurring_occurrence'),
            ),
          )
          .all(),
      ]);

      let maxMade: string | null = null;
      for (const r of txRefs) {
        const d = extractDateFromRef(r.externalRef, id);
        if (d && (maxMade === null || d > maxMade)) maxMade = d;
      }
      for (const r of plannedRefs) {
        const d = extractDateFromRef(r.refKey, id);
        if (d && (maxMade === null || d > maxMade)) maxMade = d;
      }

      const yesterday = subtractOneDay(today);
      const floorDate = maxMade !== null && maxMade > yesterday ? maxMade : yesterday;
      nextDueOn = nextOccurrenceAfter(nextSchedule, floorDate);
    }

    let nextStatus = existing.status as RecurringRuleView['status'];
    if (scheduleChanged) {
      if (nextStatus === 'active' && nextDueOn === null) {
        nextStatus = 'ended';
      } else if (nextStatus === 'ended' && nextDueOn !== null) {
        nextStatus = 'active';
      }
    }

    const stmts: BatchItem<'sqlite'>[] = [
      db
        .update(personalRecurringRules)
        .set({
          type: nextDraft.type,
          draft: serializeDraftWithoutTags(nextDraft),
          schedule: JSON.stringify(nextSchedule),
          askMe: nextAskMe ? 1 : 0,
          status: nextStatus,
          nextDueOn,
          lastConfirmedOn: today,
          updatedAt: now,
        })
        .where(
          and(eq(personalRecurringRules.id, id), eq(personalRecurringRules.userId, user.id)),
        ),
      // R14: editing resolves an open check-in
      db
        .update(personalPlannedItems)
        .set({ status: 'confirmed', resolvedAt: now })
        .where(
          and(
            eq(personalPlannedItems.userId, user.id),
            eq(personalPlannedItems.ruleId, id),
            eq(personalPlannedItems.kind, 'recurring_checkin'),
            eq(personalPlannedItems.status, 'waiting'),
          ),
        ),
    ];

    if (resolvedTags !== null) {
      stmts.push(
        db.delete(personalRecurringRuleTags).where(eq(personalRecurringRuleTags.ruleId, id)),
      );
      if (resolvedTags.length > 0) {
        stmts.push(
          db.insert(personalRecurringRuleTags).values(
            resolvedTags.map((t) => ({
              ruleId: id,
              tagId: t.id,
            })),
          ),
        );
      }
    }

    await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

    const rule: RecurringRuleView = {
      id,
      draft: nextDraft,
      schedule: nextSchedule,
      askMe: nextAskMe,
      status: nextStatus,
      pausedReason: (existing.pausedReason ?? null) as RecurringRuleView['pausedReason'],
      nextDueOn,
      lastConfirmedOn: today,
    };

    return c.json({ rule }, 200);
  });

  // Query cost: <= 4
  app.post('/me/personal/recurring/rules/:id/pause', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const db = getDb(c.env);

    const [existing, tagRows] = await Promise.all([
      db
        .select()
        .from(personalRecurringRules)
        .where(and(eq(personalRecurringRules.id, id), eq(personalRecurringRules.userId, user.id)))
        .get(),
      db
        .select({ name: personalTags.name })
        .from(personalRecurringRuleTags)
        .innerJoin(personalTags, eq(personalTags.id, personalRecurringRuleTags.tagId))
        .where(eq(personalRecurringRuleTags.ruleId, id))
        .all(),
    ]);

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Rule not found');
    }

    const now = nowIso();
    await db
      .update(personalRecurringRules)
      .set({
        status: 'paused',
        pausedReason: 'manual',
        updatedAt: now,
      })
      .where(and(eq(personalRecurringRules.id, id), eq(personalRecurringRules.userId, user.id)));

    const rule = toRuleView(
      {
        ...existing,
        status: 'paused',
        pausedReason: 'manual',
        updatedAt: now,
      },
      tagRows.map((t) => t.name),
    );

    return c.json({ rule }, 200);
  });

  // Query cost: <= 4
  app.post('/me/personal/recurring/rules/:id/resume', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const db = getDb(c.env);

    const [existing, tagRows] = await Promise.all([
      db
        .select()
        .from(personalRecurringRules)
        .where(and(eq(personalRecurringRules.id, id), eq(personalRecurringRules.userId, user.id)))
        .get(),
      db
        .select({ name: personalTags.name })
        .from(personalRecurringRuleTags)
        .innerJoin(personalTags, eq(personalTags.id, personalRecurringRuleTags.tagId))
        .where(eq(personalRecurringRuleTags.ruleId, id))
        .all(),
    ]);

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Rule not found');
    }

    const schedule = JSON.parse(existing.schedule) as RecurringSchedule;
    const nowDate = new Date();
    const today = vnDate(nowDate);
    const now = nowDate.toISOString();
    const { nextDueOn, nextStatus, stmts } = resumeRuleStmts(
      db,
      user.id,
      id,
      schedule,
      today,
      now,
    );

    await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

    const rule = toRuleView(
      {
        ...existing,
        status: nextStatus,
        pausedReason: null,
        nextDueOn,
        lastConfirmedOn: today,
        updatedAt: now,
      },
      tagRows.map((t) => t.name),
    );

    return c.json({ rule }, 200);
  });

  // Query cost: <= 4
  app.delete('/me/personal/recurring/rules/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const db = getDb(c.env);

    const existing = await db
      .select({ id: personalRecurringRules.id })
      .from(personalRecurringRules)
      .where(and(eq(personalRecurringRules.id, id), eq(personalRecurringRules.userId, user.id)))
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Rule not found');
    }

    await db.batch([
      db
        .delete(personalPlannedItems)
        .where(
          and(
            eq(personalPlannedItems.userId, user.id),
            eq(personalPlannedItems.ruleId, id),
            eq(personalPlannedItems.status, 'waiting'),
          ),
        ),
      db
        .delete(personalRecurringRules)
        .where(
          and(eq(personalRecurringRules.id, id), eq(personalRecurringRules.userId, user.id)),
        ),
    ]);

    return c.json({ ok: true }, 200);
  });

  return app;
}
