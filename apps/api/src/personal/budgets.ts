import { Hono } from 'hono';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { AppBindings } from '@cc/api-db/env';
import { getDb } from '@cc/api-db/client';
import {
  personalBudgetExcludedWallets,
  personalBudgetLimits,
  personalBudgets,
  personalCategories,
  personalTags,
  personalWallets,
} from '@cc/api-db/schema';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError, isDbError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';
import {
  MAX_AMOUNT,
  budgetPeriodAt,
  firstBudgetPeriod,
  isCurrencyCode,
  listCountedSpending,
  type BudgetDef,
  type BudgetLimit,
  type BudgetPeriodKind,
  type BudgetTarget,
  type BudgetView,
  type CurrencyCode,
} from '@cc/core';
import { loadReportInput } from './reports';
import { name1to40, parseJson, requireDate } from './validate';

const PERIOD_KINDS: readonly BudgetPeriodKind[] = ['week', 'month', 'year', 'once'];

function isPeriodKind(v: unknown): v is BudgetPeriodKind {
  return typeof v === 'string' && (PERIOD_KINDS as readonly string[]).includes(v);
}

function parsePositiveAmount(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0 || v > MAX_AMOUNT) {
    throw new ApiError('VALIDATION', 422, 'Invalid amount');
  }
  return v;
}

function parseTarget(v: unknown): BudgetTarget {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new ApiError('VALIDATION', 422, 'Invalid target');
  }
  const obj = v as Record<string, unknown>;
  if (obj.kind === 'category') {
    if (typeof obj.categoryId !== 'string' || obj.categoryId.trim().length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid target categoryId');
    }
    return { kind: 'category', categoryId: obj.categoryId.trim() };
  }
  if (obj.kind === 'tag') {
    if (typeof obj.tagId !== 'string' || obj.tagId.trim().length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid target tagId');
    }
    return { kind: 'tag', tagId: obj.tagId.trim() };
  }
  throw new ApiError('VALIDATION', 422, 'Invalid target kind');
}

function parseExcludedWalletIds(v: unknown): string[] {
  if (!Array.isArray(v)) {
    throw new ApiError('VALIDATION', 422, 'Invalid excludedWalletIds');
  }
  const unique = new Set<string>();
  for (const item of v) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid excludedWalletIds');
    }
    unique.add(item.trim());
  }
  return [...unique];
}

interface RawBudgetRow {
  id: string;
  name: string;
  targetKind: string;
  targetId: string;
  currency: string;
  periodKind: string;
  monthStartDay: number | null;
  fromDate: string | null;
  toDate: string | null;
  suggestionDismissedUntil: string | null;
  createdOn: string;
}

function toBudgetView(
  row: RawBudgetRow,
  limits: BudgetLimit[],
  excludedWalletIds: string[],
): BudgetView {
  const target: BudgetTarget =
    row.targetKind === 'tag'
      ? { kind: 'tag', tagId: row.targetId }
      : { kind: 'category', categoryId: row.targetId };

  return {
    id: row.id,
    name: row.name,
    target,
    currency: row.currency as CurrencyCode,
    periodKind: row.periodKind as BudgetPeriodKind,
    monthStartDay: row.monthStartDay ?? null,
    from: row.fromDate ?? null,
    to: row.toDate ?? null,
    excludedWalletIds,
    limits,
    suggestionDismissedUntil: row.suggestionDismissedUntil ?? null,
    createdOn: row.createdOn,
  };
}

export function budgetRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/personal/budgets', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    const [budgetRows, limitRows, excludedRows] = await Promise.all([
      db
        .select({
          id: personalBudgets.id,
          name: personalBudgets.name,
          targetKind: personalBudgets.targetKind,
          targetId: personalBudgets.targetId,
          currency: personalBudgets.currency,
          periodKind: personalBudgets.periodKind,
          monthStartDay: personalBudgets.monthStartDay,
          fromDate: personalBudgets.fromDate,
          toDate: personalBudgets.toDate,
          suggestionDismissedUntil: personalBudgets.suggestionDismissedUntil,
          createdOn: personalBudgets.createdOn,
          catExists: personalCategories.id,
          tagExists: personalTags.id,
        })
        .from(personalBudgets)
        .leftJoin(
          personalCategories,
          and(
            eq(personalBudgets.targetKind, 'category'),
            eq(personalCategories.id, personalBudgets.targetId),
            eq(personalCategories.userId, user.id),
          ),
        )
        .leftJoin(
          personalTags,
          and(
            eq(personalBudgets.targetKind, 'tag'),
            eq(personalTags.id, personalBudgets.targetId),
            eq(personalTags.userId, user.id),
          ),
        )
        .where(eq(personalBudgets.userId, user.id))
        .orderBy(asc(personalBudgets.createdAt))
        .all(),

      db
        .select({
          budgetId: personalBudgetLimits.budgetId,
          effectiveFrom: personalBudgetLimits.effectiveFrom,
          amount: personalBudgetLimits.amount,
        })
        .from(personalBudgetLimits)
        .innerJoin(personalBudgets, eq(personalBudgets.id, personalBudgetLimits.budgetId))
        .where(eq(personalBudgets.userId, user.id))
        .orderBy(asc(personalBudgetLimits.effectiveFrom))
        .all(),

      db
        .select({
          budgetId: personalBudgetExcludedWallets.budgetId,
          walletId: personalBudgetExcludedWallets.walletId,
        })
        .from(personalBudgetExcludedWallets)
        .innerJoin(personalBudgets, eq(personalBudgets.id, personalBudgetExcludedWallets.budgetId))
        .where(eq(personalBudgets.userId, user.id))
        .all(),
    ]);

    const orphanIds: string[] = [];
    const liveRows: typeof budgetRows = [];
    for (const row of budgetRows) {
      const targetMissing =
        (row.targetKind === 'category' && row.catExists === null) ||
        (row.targetKind === 'tag' && row.tagExists === null);
      if (targetMissing) {
        orphanIds.push(row.id);
      } else {
        liveRows.push(row);
      }
    }

    if (orphanIds.length > 0) {
      await db.batch([
        db
          .delete(personalBudgets)
          .where(and(eq(personalBudgets.userId, user.id), inArray(personalBudgets.id, orphanIds))),
      ]);
    }

    const limitsByBudget = new Map<string, BudgetLimit[]>();
    for (const l of limitRows) {
      let list = limitsByBudget.get(l.budgetId);
      if (!list) {
        list = [];
        limitsByBudget.set(l.budgetId, list);
      }
      list.push({ effectiveFrom: l.effectiveFrom, amount: l.amount });
    }

    const excludedByBudget = new Map<string, string[]>();
    for (const ex of excludedRows) {
      let list = excludedByBudget.get(ex.budgetId);
      if (!list) {
        list = [];
        excludedByBudget.set(ex.budgetId, list);
      }
      list.push(ex.walletId);
    }

    const budgets: BudgetView[] = liveRows.map((row) =>
      toBudgetView(row, limitsByBudget.get(row.id) ?? [], excludedByBudget.get(row.id) ?? []),
    );

    return c.json({ budgets }, 200);
  });

  app.get('/me/personal/budgets/progress', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const todayRaw = c.req.query('today');
    if (todayRaw !== undefined) {
      requireDate(todayRaw);
    }

    const db = getDb(c.env);
    const budgetRows = await db
      .select({
        id: personalBudgets.id,
        name: personalBudgets.name,
        targetKind: personalBudgets.targetKind,
        targetId: personalBudgets.targetId,
        currency: personalBudgets.currency,
        periodKind: personalBudgets.periodKind,
        monthStartDay: personalBudgets.monthStartDay,
        fromDate: personalBudgets.fromDate,
        toDate: personalBudgets.toDate,
        suggestionDismissedUntil: personalBudgets.suggestionDismissedUntil,
        createdOn: personalBudgets.createdOn,
      })
      .from(personalBudgets)
      .where(eq(personalBudgets.userId, user.id))
      .all();

    if (budgetRows.length === 0) {
      return c.json({ rows: [] }, 200);
    }

    const currencies = new Set<CurrencyCode>();
    let earliestFrom: string | null = null;
    for (const row of budgetRows) {
      const def = toBudgetView(row, [], []);
      currencies.add(def.currency);
      const firstFrom = firstBudgetPeriod(def).from;
      if (earliestFrom === null || firstFrom < earliestFrom) {
        earliestFrom = firstFrom;
      }
    }

    const reportInput = await loadReportInput(db, user.id);
    const allRows = listCountedSpending(reportInput);
    const rows = allRows.filter(
      (r) => currencies.has(r.currency) && (earliestFrom === null || r.date >= earliestFrom),
    );

    return c.json({ rows }, 200);
  });

  app.get('/me/personal/budgets/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const db = getDb(c.env);

    const [row, limitRows, excludedRows] = await Promise.all([
      db
        .select({
          id: personalBudgets.id,
          name: personalBudgets.name,
          targetKind: personalBudgets.targetKind,
          targetId: personalBudgets.targetId,
          currency: personalBudgets.currency,
          periodKind: personalBudgets.periodKind,
          monthStartDay: personalBudgets.monthStartDay,
          fromDate: personalBudgets.fromDate,
          toDate: personalBudgets.toDate,
          suggestionDismissedUntil: personalBudgets.suggestionDismissedUntil,
          createdOn: personalBudgets.createdOn,
          catExists: personalCategories.id,
          tagExists: personalTags.id,
        })
        .from(personalBudgets)
        .leftJoin(
          personalCategories,
          and(
            eq(personalBudgets.targetKind, 'category'),
            eq(personalCategories.id, personalBudgets.targetId),
            eq(personalCategories.userId, user.id),
          ),
        )
        .leftJoin(
          personalTags,
          and(
            eq(personalBudgets.targetKind, 'tag'),
            eq(personalTags.id, personalBudgets.targetId),
            eq(personalTags.userId, user.id),
          ),
        )
        .where(and(eq(personalBudgets.id, id), eq(personalBudgets.userId, user.id)))
        .get(),

      db
        .select({
          effectiveFrom: personalBudgetLimits.effectiveFrom,
          amount: personalBudgetLimits.amount,
        })
        .from(personalBudgetLimits)
        .where(eq(personalBudgetLimits.budgetId, id))
        .orderBy(asc(personalBudgetLimits.effectiveFrom))
        .all(),

      db
        .select({
          walletId: personalBudgetExcludedWallets.walletId,
        })
        .from(personalBudgetExcludedWallets)
        .where(eq(personalBudgetExcludedWallets.budgetId, id))
        .all(),
    ]);

    if (!row) {
      throw new ApiError('NOT_FOUND', 404, 'Budget not found');
    }

    const targetMissing =
      (row.targetKind === 'category' && row.catExists === null) ||
      (row.targetKind === 'tag' && row.tagExists === null);
    if (targetMissing) {
      await db
        .delete(personalBudgets)
        .where(and(eq(personalBudgets.id, id), eq(personalBudgets.userId, user.id)));
      throw new ApiError('NOT_FOUND', 404, 'Budget not found');
    }

    const budget = toBudgetView(
      row,
      limitRows.map((l) => ({ effectiveFrom: l.effectiveFrom, amount: l.amount })),
      excludedRows.map((e) => e.walletId),
    );

    return c.json({ budget }, 200);
  });

  app.post('/me/personal/budgets', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const target = parseTarget(body.target);
    if (!isCurrencyCode(body.currency)) {
      throw new ApiError('VALIDATION', 422, 'Invalid currency');
    }
    const currency: CurrencyCode = body.currency;
    const amount = parsePositiveAmount(body.amount);

    if (!isPeriodKind(body.periodKind)) {
      throw new ApiError('VALIDATION', 422, 'Invalid periodKind');
    }
    const periodKind: BudgetPeriodKind = body.periodKind;

    let monthStartDay: number | null = null;
    if (periodKind === 'month') {
      if (body.monthStartDay === undefined || body.monthStartDay === null) {
        monthStartDay = 1;
      } else if (
        typeof body.monthStartDay === 'number' &&
        Number.isInteger(body.monthStartDay) &&
        body.monthStartDay >= 1 &&
        body.monthStartDay <= 31
      ) {
        monthStartDay = body.monthStartDay;
      } else {
        throw new ApiError('VALIDATION', 422, 'Invalid monthStartDay');
      }
    } else if (body.monthStartDay !== undefined && body.monthStartDay !== null) {
      throw new ApiError('VALIDATION', 422, 'monthStartDay is only valid for monthly budgets');
    }

    let fromDate: string | null = null;
    let toDate: string | null = null;
    if (periodKind === 'once') {
      fromDate = requireDate(body.from);
      toDate = requireDate(body.to);
      if (fromDate > toDate) {
        throw new ApiError('VALIDATION', 422, 'from must be on or before to');
      }
    } else if (
      (body.from !== undefined && body.from !== null) ||
      (body.to !== undefined && body.to !== null)
    ) {
      throw new ApiError('VALIDATION', 422, 'from and to are only valid for one-off budgets');
    }

    const excludedWalletIds = parseExcludedWalletIds(body.excludedWalletIds);
    const today = requireDate(body.today);
    const explicitName =
      body.name !== undefined && body.name !== null ? name1to40(body.name) : null;

    const db = getDb(c.env);

    // Ownership checks: target + excluded wallets
    const targetId = target.kind === 'category' ? target.categoryId : target.tagId;
    const [targetRow, walletRows] = await Promise.all([
      target.kind === 'category'
        ? db
            .select({
              id: personalCategories.id,
              name: personalCategories.name,
              type: personalCategories.type,
            })
            .from(personalCategories)
            .where(and(eq(personalCategories.id, targetId), eq(personalCategories.userId, user.id)))
            .get()
        : db
            .select({
              id: personalTags.id,
              name: personalTags.name,
            })
            .from(personalTags)
            .where(and(eq(personalTags.id, targetId), eq(personalTags.userId, user.id)))
            .get(),
      excludedWalletIds.length > 0
        ? db
            .select({ id: personalWallets.id })
            .from(personalWallets)
            .where(
              and(
                eq(personalWallets.userId, user.id),
                inArray(personalWallets.id, excludedWalletIds),
              ),
            )
            .all()
        : Promise.resolve([]),
    ]);

    if (!targetRow) {
      throw new ApiError('VALIDATION', 422, 'Target not found');
    }
    if (target.kind === 'category' && 'type' in targetRow && targetRow.type !== 'expense') {
      throw new ApiError('VALIDATION', 422, 'Budget category must be an expense category');
    }
    if (walletRows.length !== excludedWalletIds.length) {
      throw new ApiError('VALIDATION', 422, 'Invalid excludedWalletIds');
    }

    const name = explicitName ?? targetRow.name.trim().slice(0, 40);
    const id = newId();
    const now = nowIso();

    const draftDef: BudgetDef = {
      id,
      name,
      target,
      currency,
      periodKind,
      monthStartDay,
      from: fromDate,
      to: toDate,
      excludedWalletIds,
      limits: [],
      suggestionDismissedUntil: null,
      createdOn: today,
    };
    const effectiveFrom = firstBudgetPeriod(draftDef).from;

    const stmts: BatchItem<'sqlite'>[] = [
      db.insert(personalBudgets).values({
        id,
        userId: user.id,
        name,
        targetKind: target.kind,
        targetId,
        currency,
        periodKind,
        monthStartDay,
        fromDate,
        toDate,
        suggestionDismissedUntil: null,
        createdOn: today,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(personalBudgetLimits).values({
        budgetId: id,
        effectiveFrom,
        amount,
      }),
    ];

    if (excludedWalletIds.length > 0) {
      stmts.push(
        db.insert(personalBudgetExcludedWallets).values(
          excludedWalletIds.map((walletId) => ({
            budgetId: id,
            walletId,
          })),
        ),
      );
    }

    try {
      await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
    } catch (err) {
      if (isDbError(err, 'UNIQUE constraint failed') || isDbError(err, 'UNIQUE')) {
        throw new ApiError('DUPLICATE', 409, 'A budget for this target and period already exists.');
      }
      throw err;
    }

    const budget: BudgetView = {
      ...draftDef,
      limits: [{ effectiveFrom, amount }],
    };

    return c.json({ budget }, 201);
  });

  app.patch('/me/personal/budgets/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    if (
      body.periodKind !== undefined ||
      body.monthStartDay !== undefined ||
      body.target !== undefined ||
      body.currency !== undefined ||
      body.from !== undefined ||
      body.to !== undefined
    ) {
      throw new ApiError('VALIDATION', 422, 'Period, start day, target, and currency cannot be changed');
    }

    const today = requireDate(body.today);
    const nextName = body.name !== undefined ? name1to40(body.name) : undefined;
    const nextAmount = body.amount !== undefined ? parsePositiveAmount(body.amount) : undefined;
    const nextExcludedWalletIds =
      body.excludedWalletIds !== undefined
        ? parseExcludedWalletIds(body.excludedWalletIds)
        : undefined;

    if (body.dismissSuggestion !== undefined && typeof body.dismissSuggestion !== 'boolean') {
      throw new ApiError('VALIDATION', 422, 'Invalid dismissSuggestion');
    }
    const dismissSuggestion = body.dismissSuggestion as boolean | undefined;

    const db = getDb(c.env);

    const [existingRow, limitRows, excludedRows, ownedWallets] = await Promise.all([
      db
        .select({
          id: personalBudgets.id,
          name: personalBudgets.name,
          targetKind: personalBudgets.targetKind,
          targetId: personalBudgets.targetId,
          currency: personalBudgets.currency,
          periodKind: personalBudgets.periodKind,
          monthStartDay: personalBudgets.monthStartDay,
          fromDate: personalBudgets.fromDate,
          toDate: personalBudgets.toDate,
          suggestionDismissedUntil: personalBudgets.suggestionDismissedUntil,
          createdOn: personalBudgets.createdOn,
        })
        .from(personalBudgets)
        .where(and(eq(personalBudgets.id, id), eq(personalBudgets.userId, user.id)))
        .get(),

      db
        .select({
          effectiveFrom: personalBudgetLimits.effectiveFrom,
          amount: personalBudgetLimits.amount,
        })
        .from(personalBudgetLimits)
        .where(eq(personalBudgetLimits.budgetId, id))
        .orderBy(asc(personalBudgetLimits.effectiveFrom))
        .all(),

      db
        .select({
          walletId: personalBudgetExcludedWallets.walletId,
        })
        .from(personalBudgetExcludedWallets)
        .where(eq(personalBudgetExcludedWallets.budgetId, id))
        .all(),

      nextExcludedWalletIds && nextExcludedWalletIds.length > 0
        ? db
            .select({ id: personalWallets.id })
            .from(personalWallets)
            .where(
              and(
                eq(personalWallets.userId, user.id),
                inArray(personalWallets.id, nextExcludedWalletIds),
              ),
            )
            .all()
        : Promise.resolve([]),
    ]);

    if (!existingRow) {
      throw new ApiError('NOT_FOUND', 404, 'Budget not found');
    }

    if (nextExcludedWalletIds && ownedWallets.length !== nextExcludedWalletIds.length) {
      throw new ApiError('VALIDATION', 422, 'Invalid excludedWalletIds');
    }

    const existingLimits: BudgetLimit[] = limitRows.map((l) => ({
      effectiveFrom: l.effectiveFrom,
      amount: l.amount,
    }));
    const existingExcluded = excludedRows.map((e) => e.walletId);
    const existingDef = toBudgetView(existingRow, existingLimits, existingExcluded);

    const periodStart = (budgetPeriodAt(existingDef, today) ?? firstBudgetPeriod(existingDef)).from;
    const finalName = nextName ?? existingRow.name;
    const finalDismissedUntil =
      dismissSuggestion === true ? periodStart : existingRow.suggestionDismissedUntil ?? null;
    const now = nowIso();

    const stmts: BatchItem<'sqlite'>[] = [
      db
        .update(personalBudgets)
        .set({
          name: finalName,
          suggestionDismissedUntil: finalDismissedUntil,
          updatedAt: now,
        })
        .where(and(eq(personalBudgets.id, id), eq(personalBudgets.userId, user.id))),
    ];

    let finalLimits = [...existingLimits];
    if (nextAmount !== undefined) {
      stmts.push(
        db
          .insert(personalBudgetLimits)
          .values({
            budgetId: id,
            effectiveFrom: periodStart,
            amount: nextAmount,
          })
          .onConflictDoUpdate({
            target: [personalBudgetLimits.budgetId, personalBudgetLimits.effectiveFrom],
            set: { amount: nextAmount },
          }),
      );
      const idx = finalLimits.findIndex((l) => l.effectiveFrom === periodStart);
      if (idx >= 0) {
        finalLimits[idx] = { effectiveFrom: periodStart, amount: nextAmount };
      } else {
        finalLimits.push({ effectiveFrom: periodStart, amount: nextAmount });
        finalLimits.sort((a, b) =>
          a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0,
        );
      }
    }

    let finalExcluded = existingExcluded;
    if (nextExcludedWalletIds !== undefined) {
      stmts.push(
        db
          .delete(personalBudgetExcludedWallets)
          .where(eq(personalBudgetExcludedWallets.budgetId, id)),
      );
      if (nextExcludedWalletIds.length > 0) {
        stmts.push(
          db.insert(personalBudgetExcludedWallets).values(
            nextExcludedWalletIds.map((walletId) => ({
              budgetId: id,
              walletId,
            })),
          ),
        );
      }
      finalExcluded = nextExcludedWalletIds;
    }

    await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);

    const budget: BudgetView = {
      ...existingDef,
      name: finalName,
      suggestionDismissedUntil: finalDismissedUntil,
      limits: finalLimits,
      excludedWalletIds: finalExcluded,
    };

    return c.json({ budget }, 200);
  });

  app.delete('/me/personal/budgets/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const db = getDb(c.env);

    const existing = await db
      .select({ id: personalBudgets.id })
      .from(personalBudgets)
      .where(and(eq(personalBudgets.id, id), eq(personalBudgets.userId, user.id)))
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Budget not found');
    }

    await db
      .delete(personalBudgets)
      .where(and(eq(personalBudgets.id, id), eq(personalBudgets.userId, user.id)));

    return c.json({ ok: true }, 200);
  });

  return app;
}
