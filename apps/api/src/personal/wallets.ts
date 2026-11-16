import { Hono } from 'hono';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import {
  personalTransactions,
  personalWallets,
  personalWalletSettings,
} from '@cc/api-db/schema';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError, isDbError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';
import {
  isCurrencyCode,
  isValidAmount,
  walletBalance,
  walletVndValues,
  type CalcEntry,
  type CalcWallet,
  type CurrencyCode,
  type PersonalEntryType,
  type WalletDetailView,
  type WalletKind,
} from '@cc/core';
import { name1to40, parseJson, requireDate } from './validate';

export interface LoadedCalcWallet extends CalcWallet {
  userId: string;
  name: string;
  isDefault: boolean;
  kind: WalletKind;
  icon: string | null;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function loadCalc(
  db: Db,
  userId: string,
): Promise<{ wallets: LoadedCalcWallet[]; entries: CalcEntry[] }> {
  const walletRows = await db
    .select({
      id: personalWallets.id,
      userId: personalWallets.userId,
      name: personalWallets.name,
      currency: personalWallets.currency,
      startAmount: personalWallets.startAmount,
      startDate: personalWallets.startDate,
      isDefault: personalWallets.isDefault,
      createdAt: personalWallets.createdAt,
      updatedAt: personalWallets.updatedAt,
      kind: personalWalletSettings.kind,
      startCostVnd: personalWalletSettings.startCostVnd,
      icon: personalWalletSettings.icon,
      sortOrder: personalWalletSettings.sortOrder,
      archivedAt: personalWalletSettings.archivedAt,
    })
    .from(personalWallets)
    .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
    .where(eq(personalWallets.userId, userId))
    .orderBy(sql`coalesce(${personalWalletSettings.sortOrder}, 0) asc`, asc(personalWallets.createdAt))
    .all();

  const entryRows = await db
    .select({
      id: personalTransactions.id,
      walletId: personalTransactions.walletId,
      type: personalTransactions.type,
      amount: personalTransactions.amount,
      date: personalTransactions.date,
      time: personalTransactions.time,
      createdAt: personalTransactions.createdAt,
      transferId: personalTransactions.transferId,
      excludeFromReports: personalTransactions.excludeFromReports,
    })
    .from(personalTransactions)
    .where(eq(personalTransactions.userId, userId))
    .all();

  const wallets: LoadedCalcWallet[] = walletRows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.name,
    currency: r.currency as CurrencyCode,
    startAmount: r.startAmount,
    startDate: r.startDate,
    isDefault: Boolean(r.isDefault),
    kind: (r.kind ?? 'everyday') as WalletKind,
    startCostVnd: r.startCostVnd ?? null,
    icon: r.icon ?? null,
    sortOrder: r.sortOrder ?? 0,
    archived: r.archivedAt !== null && r.archivedAt !== undefined,
    archivedAt: r.archivedAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  const entries: CalcEntry[] = entryRows.map((e) => ({
    id: e.id,
    walletId: e.walletId,
    type: e.type as PersonalEntryType,
    amount: e.amount,
    date: e.date,
    time: e.time ?? null,
    createdAt: e.createdAt,
    transferId: e.transferId ?? null,
    excludeFromReports: Boolean(e.excludeFromReports),
  }));

  return { wallets, entries };
}

function isWalletKind(v: unknown): v is WalletKind {
  return v === 'everyday' || v === 'investment';
}

function parseOptionalIcon(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    throw new ApiError('VALIDATION', 422, 'Invalid icon');
  }
  const trimmed = v.trim();
  if (trimmed.length < 1 || trimmed.length > 40) {
    throw new ApiError('VALIDATION', 422, 'Invalid icon');
  }
  return trimmed;
}

function validateCreateWallet(
  body: unknown,
  now: string,
  allowNegative: boolean,
): {
  name: string;
  currency: CurrencyCode;
  kind: WalletKind;
  startAmount: number;
  startDate: string;
  startCostVnd: number | null;
  icon: string | null;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
  const input = body as Record<string, unknown>;
  const name = name1to40(input.name);

  let currency: CurrencyCode = 'VND';
  if (input.currency !== undefined) {
    if (!isCurrencyCode(input.currency)) {
      throw new ApiError('VALIDATION', 422, 'Invalid currency');
    }
    currency = input.currency;
  }

  let kind: WalletKind = 'everyday';
  if (input.kind !== undefined) {
    if (!isWalletKind(input.kind)) {
      throw new ApiError('VALIDATION', 422, 'Invalid kind');
    }
    kind = input.kind;
  }

  if (!isValidAmount(input.startAmount, currency, { allowZero: true, allowNegative })) {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
  const startAmount = input.startAmount;

  const startDate = input.startDate !== undefined ? requireDate(input.startDate) : now.slice(0, 10);

  let startCostVnd: number | null = null;
  if (currency !== 'VND' && startAmount !== 0) {
    if (!isValidAmount(input.startCostVnd, 'VND', { allowZero: true, allowNegative: false })) {
      throw new ApiError('VALIDATION', 422, 'Invalid startCostVnd');
    }
    startCostVnd = input.startCostVnd;
  } else {
    if (input.startCostVnd !== undefined && input.startCostVnd !== null) {
      throw new ApiError('VALIDATION', 422, 'Invalid startCostVnd');
    }
  }

  const icon = parseOptionalIcon(input.icon);

  return { name, currency, kind, startAmount, startDate, startCostVnd, icon };
}

function toWalletView(
  w: LoadedCalcWallet,
  entries: CalcEntry[],
  vndValues: Map<string, number | null>,
  entryCount: number,
): WalletDetailView {
  return {
    id: w.id,
    name: w.name,
    currency: w.currency,
    balance: walletBalance(w, entries),
    isDefault: w.isDefault,
    kind: w.kind,
    startAmount: w.startAmount,
    startDate: w.startDate,
    startCostVnd: w.startCostVnd,
    vndValue: vndValues.get(w.id) ?? null,
    icon: w.icon,
    sortOrder: w.sortOrder,
    archived: w.archived,
    entryCount,
  };
}

export function walletRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/personal/wallets', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    const { wallets: calcWallets, entries } = await loadCalc(db, user.id);
    const countRows = await db
      .select({
        walletId: personalTransactions.walletId,
        count: sql<number>`count(*)`,
      })
      .from(personalTransactions)
      .where(eq(personalTransactions.userId, user.id))
      .groupBy(personalTransactions.walletId)
      .all();

    const counts = new Map<string, number>(
      countRows.map((r) => [r.walletId, Number(r.count)]),
    );
    const vndValues = walletVndValues(calcWallets, entries);

    const wallets: WalletDetailView[] = calcWallets.map((w) =>
      toWalletView(w, entries, vndValues, counts.get(w.id) ?? 0),
    );

    return c.json({ wallets }, 200);
  });

  app.post('/me/personal/wallets', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);
    const now = nowIso();
    const validated = validateCreateWallet(body, now, false);

    const db = getDb(c.env);

    const existing = await db
      .select({ id: personalWallets.id })
      .from(personalWallets)
      .where(eq(personalWallets.userId, user.id))
      .get();

    if (existing) {
      throw new ApiError('ALREADY_HANDLED', 409, 'You already have a wallet.');
    }

    const walletId = newId();

    try {
      await db.batch([
        db.insert(personalWallets).values({
          id: walletId,
          userId: user.id,
          name: validated.name,
          currency: validated.currency,
          startAmount: validated.startAmount,
          startDate: validated.startDate,
          isDefault: 1,
          createdAt: now,
          updatedAt: now,
        }),
        db.insert(personalWalletSettings).values({
          walletId,
          userId: user.id,
          kind: validated.kind,
          startCostVnd: validated.startCostVnd,
          icon: validated.icon,
          sortOrder: 0,
          archivedAt: null,
          updatedAt: now,
        }),
      ]);
    } catch (err) {
      if (isDbError(err, 'UNIQUE constraint failed') || isDbError(err, 'UNIQUE')) {
        throw new ApiError('ALREADY_HANDLED', 409, 'You already have a wallet.');
      }
      throw err;
    }

    const created: LoadedCalcWallet = {
      id: walletId,
      userId: user.id,
      name: validated.name,
      currency: validated.currency,
      startAmount: validated.startAmount,
      startDate: validated.startDate,
      isDefault: true,
      kind: validated.kind,
      startCostVnd: validated.startCostVnd,
      icon: validated.icon,
      sortOrder: 0,
      archived: false,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const vndValues = walletVndValues([created], []);
    const wallet = toWalletView(created, [], vndValues, 0);

    return c.json({ wallet }, 201);
  });

  app.post('/me/personal/wallets/add', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);
    const now = nowIso();
    const validated = validateCreateWallet(body, now, true);

    const db = getDb(c.env);

    const defaultRow = await db
      .select({ id: personalWallets.id })
      .from(personalWallets)
      .where(and(eq(personalWallets.userId, user.id), eq(personalWallets.isDefault, 1)))
      .get();

    const maxRow = await db
      .select({
        maxOrder: sql<number | null>`max(coalesce(${personalWalletSettings.sortOrder}, 0))`,
      })
      .from(personalWallets)
      .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
      .where(eq(personalWallets.userId, user.id))
      .get();

    const isDefault = !defaultRow;
    const sortOrder = (maxRow?.maxOrder ?? -1) + 1;
    const walletId = newId();

    try {
      await db.batch([
        db.insert(personalWallets).values({
          id: walletId,
          userId: user.id,
          name: validated.name,
          currency: validated.currency,
          startAmount: validated.startAmount,
          startDate: validated.startDate,
          isDefault: isDefault ? 1 : 0,
          createdAt: now,
          updatedAt: now,
        }),
        db.insert(personalWalletSettings).values({
          walletId,
          userId: user.id,
          kind: validated.kind,
          startCostVnd: validated.startCostVnd,
          icon: validated.icon,
          sortOrder,
          archivedAt: null,
          updatedAt: now,
        }),
      ]);
    } catch (err) {
      if (isDbError(err, 'UNIQUE constraint failed') || isDbError(err, 'UNIQUE')) {
        throw new ApiError('ALREADY_HANDLED', 409, 'You already have a default wallet.');
      }
      throw err;
    }

    const created: LoadedCalcWallet = {
      id: walletId,
      userId: user.id,
      name: validated.name,
      currency: validated.currency,
      startAmount: validated.startAmount,
      startDate: validated.startDate,
      isDefault,
      kind: validated.kind,
      startCostVnd: validated.startCostVnd,
      icon: validated.icon,
      sortOrder,
      archived: false,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const vndValues = walletVndValues([created], []);
    const wallet = toWalletView(created, [], vndValues, 0);

    return c.json({ wallet }, 201);
  });

  app.post('/me/personal/wallets/reorder', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    if (!Array.isArray(body.ids) || !body.ids.every((x): x is string => typeof x === 'string')) {
      throw new ApiError('VALIDATION', 422, 'Invalid ids');
    }
    const ids = body.ids;

    const db = getDb(c.env);
    const rows = await db
      .select({ id: personalWallets.id })
      .from(personalWallets)
      .where(eq(personalWallets.userId, user.id))
      .all();

    const userIds = new Set(rows.map((r) => r.id));
    const seen = new Set<string>();
    for (const id of ids) {
      if (!userIds.has(id) || seen.has(id)) {
        throw new ApiError('VALIDATION', 422, 'Invalid ids');
      }
      seen.add(id);
    }
    if (ids.length !== userIds.size) {
      throw new ApiError('VALIDATION', 422, 'Invalid ids');
    }

    const now = nowIso();
    if (ids.length > 0) {
      const stmts: BatchItem<'sqlite'>[] = ids.map((walletId, index) =>
        db
          .insert(personalWalletSettings)
          .values({
            walletId,
            userId: user.id,
            kind: 'everyday',
            startCostVnd: null,
            icon: null,
            sortOrder: index,
            archivedAt: null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: personalWalletSettings.walletId,
            set: {
              sortOrder: index,
              updatedAt: now,
            },
          }),
      );
      try {
      await db.batch([stmts[0]!, ...stmts.slice(1)]);
    } catch (err) {
      if (isDbError(err, 'UNIQUE constraint failed') || isDbError(err, 'UNIQUE')) {
        throw new ApiError('ALREADY_HANDLED', 409, 'You already have a default wallet.');
      }
      throw err;
    }
    }

    return c.json({ ok: true }, 200);
  });

  app.patch('/me/personal/wallets/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const walletId = c.req.param('id');
    const body = await parseJson<Record<string, unknown>>(c);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const db = getDb(c.env);
    const existing = await db
      .select({
        id: personalWallets.id,
        userId: personalWallets.userId,
        name: personalWallets.name,
        currency: personalWallets.currency,
        startAmount: personalWallets.startAmount,
        startDate: personalWallets.startDate,
        isDefault: personalWallets.isDefault,
        createdAt: personalWallets.createdAt,
        kind: personalWalletSettings.kind,
        startCostVnd: personalWalletSettings.startCostVnd,
        icon: personalWalletSettings.icon,
        sortOrder: personalWalletSettings.sortOrder,
        archivedAt: personalWalletSettings.archivedAt,
      })
      .from(personalWallets)
      .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
      .where(and(eq(personalWallets.id, walletId), eq(personalWallets.userId, user.id)))
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Wallet not found');
    }

    const currentCurrency = existing.currency as CurrencyCode;
    const currentKind = (existing.kind ?? 'everyday') as WalletKind;
    const currentStartAmount = existing.startAmount;
    const currentStartDate = existing.startDate;
    const currentStartCostVnd = existing.startCostVnd ?? null;
    const currentIcon = existing.icon ?? null;
    const currentSortOrder = existing.sortOrder ?? 0;
    const currentArchivedAt = existing.archivedAt ?? null;
    const currentIsDefault = Boolean(existing.isDefault);

    const nextName = body.name !== undefined ? name1to40(body.name) : existing.name;

    let nextCurrency = currentCurrency;
    if (body.currency !== undefined) {
      if (!isCurrencyCode(body.currency)) {
        throw new ApiError('VALIDATION', 422, 'Invalid currency');
      }
      nextCurrency = body.currency;
    }

    let nextKind = currentKind;
    if (body.kind !== undefined) {
      if (!isWalletKind(body.kind)) {
        throw new ApiError('VALIDATION', 422, 'Invalid kind');
      }
      nextKind = body.kind;
    }

    let nextStartAmount = currentStartAmount;
    if (body.startAmount !== undefined) {
      if (!isValidAmount(body.startAmount, nextCurrency, { allowZero: true, allowNegative: true })) {
        throw new ApiError('VALIDATION', 422, 'Invalid startAmount');
      }
      nextStartAmount = body.startAmount;
    } else if (!isValidAmount(nextStartAmount, nextCurrency, { allowZero: true, allowNegative: true })) {
      throw new ApiError('VALIDATION', 422, 'Invalid startAmount');
    }

    const nextStartDate = body.startDate !== undefined ? requireDate(body.startDate) : currentStartDate;

    let nextStartCostVnd: number | null = null;
    if (nextCurrency !== 'VND' && nextStartAmount !== 0) {
      const candidate = body.startCostVnd !== undefined ? body.startCostVnd : currentStartCostVnd;
      if (!isValidAmount(candidate, 'VND', { allowZero: true, allowNegative: false })) {
        throw new ApiError('VALIDATION', 422, 'Invalid startCostVnd');
      }
      nextStartCostVnd = candidate;
    } else {
      if (body.startCostVnd !== undefined && body.startCostVnd !== null) {
        throw new ApiError('VALIDATION', 422, 'Invalid startCostVnd');
      }
      nextStartCostVnd = null;
    }

    const nextIcon = body.icon !== undefined ? parseOptionalIcon(body.icon) : currentIcon;

    let nextArchived = Boolean(currentArchivedAt);
    if (body.archived !== undefined) {
      if (typeof body.archived !== 'boolean') {
        throw new ApiError('VALIDATION', 422, 'Invalid archived');
      }
      nextArchived = body.archived;
    }

    if (body.isDefault !== undefined && body.isDefault !== true) {
      throw new ApiError('VALIDATION', 422, 'Invalid isDefault');
    }

    const nextIsDefault = body.isDefault === true ? true : currentIsDefault;

    if (nextIsDefault && nextArchived) {
      throw new ApiError('DEFAULT_WALLET', 409, 'Cannot archive the default wallet.');
    }

    const countRow = await db
      .select({ count: sql<number>`count(*)` })
      .from(personalTransactions)
      .where(eq(personalTransactions.walletId, walletId))
      .get();
    const entryCount = Number(countRow?.count ?? 0);

    if ((nextKind !== currentKind || nextCurrency !== currentCurrency) && entryCount > 0) {
      throw new ApiError('IN_USE', 409, 'Wallet has entries.');
    }

    const now = nowIso();
    const nextArchivedAt = nextArchived ? (currentArchivedAt ?? now) : null;

    const stmts: BatchItem<'sqlite'>[] = [];
    if (body.isDefault === true && !currentIsDefault) {
      stmts.push(
        db
          .update(personalWallets)
          .set({ isDefault: 0, updatedAt: now })
          .where(and(eq(personalWallets.userId, user.id), eq(personalWallets.isDefault, 1))),
      );
    }

    stmts.push(
      db
        .update(personalWallets)
        .set({
          name: nextName,
          currency: nextCurrency,
          startAmount: nextStartAmount,
          startDate: nextStartDate,
          isDefault: nextIsDefault ? 1 : 0,
          updatedAt: now,
        })
        .where(and(eq(personalWallets.id, walletId), eq(personalWallets.userId, user.id))),
      db
        .insert(personalWalletSettings)
        .values({
          walletId,
          userId: user.id,
          kind: nextKind,
          startCostVnd: nextStartCostVnd,
          icon: nextIcon,
          sortOrder: currentSortOrder,
          archivedAt: nextArchivedAt,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: personalWalletSettings.walletId,
          set: {
            kind: nextKind,
            startCostVnd: nextStartCostVnd,
            icon: nextIcon,
            archivedAt: nextArchivedAt,
            updatedAt: now,
          },
        }),
    );

    try {
      await db.batch([stmts[0]!, ...stmts.slice(1)]);
    } catch (err) {
      if (isDbError(err, 'UNIQUE constraint failed') || isDbError(err, 'UNIQUE')) {
        throw new ApiError('ALREADY_HANDLED', 409, 'You already have a default wallet.');
      }
      throw err;
    }

    const { wallets: calcWallets, entries } = await loadCalc(db, user.id);
    const vndValues = walletVndValues(calcWallets, entries);
    const updated = calcWallets.find((w) => w.id === walletId)!;
    const wallet = toWalletView(updated, entries, vndValues, entryCount);

    return c.json({ wallet }, 200);
  });

  app.delete('/me/personal/wallets/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const walletId = c.req.param('id');
    const db = getDb(c.env);

    const existing = await db
      .select({
        id: personalWallets.id,
        isDefault: personalWallets.isDefault,
      })
      .from(personalWallets)
      .where(and(eq(personalWallets.id, walletId), eq(personalWallets.userId, user.id)))
      .get();

    if (!existing) {
      throw new ApiError('NOT_FOUND', 404, 'Wallet not found');
    }

    const hasEntry = await db
      .select({ id: personalTransactions.id })
      .from(personalTransactions)
      .where(eq(personalTransactions.walletId, walletId))
      .get();

    if (hasEntry) {
      throw new ApiError('IN_USE', 409, 'Wallet has entries.');
    }

    if (existing.isDefault === 1) {
      const other = await db
        .select({ id: personalWallets.id })
        .from(personalWallets)
        .where(and(eq(personalWallets.userId, user.id), ne(personalWallets.id, walletId)))
        .get();

      if (other) {
        throw new ApiError('DEFAULT_WALLET', 409, 'Cannot delete default wallet while other wallets exist.');
      }
    }

    await db.batch([
      db.delete(personalWalletSettings).where(eq(personalWalletSettings.walletId, walletId)),
      db
        .delete(personalWallets)
        .where(and(eq(personalWallets.id, walletId), eq(personalWallets.userId, user.id))),
    ]);

    return c.json({ ok: true }, 200);
  });

  return app;
}
