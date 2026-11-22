import { Hono } from 'hono';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import {
  personalTransactions,
  personalWalletBalances,
  personalWalletOptions,
  personalWallets,
  personalWalletSettings,
} from '@cc/api-db/schema';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError, isDbError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';
import {
  findOversell,
  groupWalletEntries,
  isCurrencyCode,
  isValidAmount,
  pickFallbackVndWallet,
  replayWallets,
  vndTotalFromCache,
  walletBalance,
  walletVndValues,
  type CalcEntry,
  type CalcWallet,
  type CurrencyCode,
  type Holding,
  type PersonalEntryType,
  type VndTotal,
  type WalletDetailView,
  type WalletKind,
} from '@cc/core';
import { loadGroupRows, loadGroupSettings } from './groupShares';
import {
  DEFAULT_WALLET_DELTA_KEY,
  loadCachedGroupRows,
  loadCachedGroupWalletDeltas,
} from './tripCache';
import { initWalletBalanceStmt, signedPersonalAmount, walletBalanceDeltaStmts } from './balanceCache';
import { name1to40, parseJson, requireDate } from './validate';

export interface LoadedCalcWallet extends CalcWallet {
  userId: string;
  name: string;
  isDefault: boolean;
  kind: WalletKind;
  icon: string | null;
  sortOrder: number;
  archivedAt: string | null;
  excludeFromReports: boolean;
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
      excludeFromReports: personalWalletOptions.excludeFromReports,
    })
    .from(personalWallets)
    .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
    .leftJoin(personalWalletOptions, eq(personalWalletOptions.walletId, personalWallets.id))
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
      assetId: personalTransactions.assetId,
      quantity: personalTransactions.quantity,
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
    excludeFromReports: Boolean(r.excludeFromReports),
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
    assetId: e.assetId ?? null,
    quantity: e.quantity ?? null,
  }));

  const [groupRows, groupSettings] = await Promise.all([
    loadGroupRows(db, userId),
    loadGroupSettings(db, userId),
  ]);
  const defaultWalletId = wallets.find((w) => w.isDefault)?.id ?? null;
  entries.push(...groupWalletEntries(groupRows, wallets, defaultWalletId, groupSettings));

  return { wallets, entries };
}

export interface CachedWalletCalc extends LoadedCalcWallet {
  entryCount: number;
}

export interface CachedWalletsSummary {
  wallets: CachedWalletCalc[];
  vnd: VndTotal;
  walletBalances: Map<string, number>;
  vndValues: Map<string, number | null>;
  holdingsByWallet: Map<string, Holding[]>;
}

export async function loadCachedWalletsSummary(
  db: Db,
  userId: string,
): Promise<CachedWalletsSummary> {
  const [walletRows, rawGroupDeltas] = await Promise.all([
    db
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
        excludeFromReports: personalWalletOptions.excludeFromReports,
        balWalletId: personalWalletBalances.walletId,
        personalNet: personalWalletBalances.personalNet,
        entryCount: personalWalletBalances.entryCount,
        cachedVndValue: personalWalletBalances.vndValue,
        cachedCashVnd: personalWalletBalances.cashVnd,
        holdingsJson: personalWalletBalances.holdingsJson,
        needsReplay: personalWalletBalances.needsReplay,
      })
      .from(personalWallets)
      .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
      .leftJoin(personalWalletOptions, eq(personalWalletOptions.walletId, personalWallets.id))
      .leftJoin(personalWalletBalances, eq(personalWalletBalances.walletId, personalWallets.id))
      .where(eq(personalWallets.userId, userId))
      .orderBy(sql`coalesce(${personalWalletSettings.sortOrder}, 0) asc`, asc(personalWallets.createdAt))
      .all(),
    loadCachedGroupWalletDeltas(db, userId),
  ]);

  const wallets: CachedWalletCalc[] = walletRows.map((r) => ({
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
    excludeFromReports: Boolean(r.excludeFromReports),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    entryCount: Number(r.entryCount ?? 0),
  }));

  const needsFullReplay = walletRows.some(
    (r) =>
      r.balWalletId === null ||
      r.needsReplay === 1 ||
      ((r.kind ?? 'everyday') === 'investment' && r.holdingsJson === null) ||
      (r.currency !== 'VND' &&
        r.startCostVnd !== null &&
        r.startAmount !== 0 &&
        r.cachedVndValue === null),
  );

  if (needsFullReplay) {
    const [entryRows, groupRows, groupSettings] = await Promise.all([
      db
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
          assetId: personalTransactions.assetId,
          quantity: personalTransactions.quantity,
        })
        .from(personalTransactions)
        .where(eq(personalTransactions.userId, userId))
        .all(),
      loadCachedGroupRows(db, userId),
      loadGroupSettings(db, userId),
    ]);

    const netByWallet = new Map<string, number>();
    const countByWallet = new Map<string, number>();
    const entries: CalcEntry[] = entryRows.map((e) => {
      const pType = e.type as PersonalEntryType;
      netByWallet.set(e.walletId, (netByWallet.get(e.walletId) ?? 0) + signedPersonalAmount(pType, e.amount));
      countByWallet.set(e.walletId, (countByWallet.get(e.walletId) ?? 0) + 1);
      return {
        id: e.id,
        walletId: e.walletId,
        type: pType,
        amount: e.amount,
        date: e.date,
        time: e.time ?? null,
        createdAt: e.createdAt,
        transferId: e.transferId ?? null,
        excludeFromReports: Boolean(e.excludeFromReports),
        assetId: e.assetId ?? null,
        quantity: e.quantity ?? null,
      };
    });

    const defaultWalletId = wallets.find((w) => w.isDefault)?.id ?? null;
    entries.push(...groupWalletEntries(groupRows, wallets, defaultWalletId, groupSettings));

    const { vndValues, cashVndValues, holdingsByWallet } = replayWallets(wallets, entries);
    const walletBalances = new Map<string, number>();
    for (const w of wallets) {
      w.entryCount = countByWallet.get(w.id) ?? 0;
      walletBalances.set(w.id, walletBalance(w, entries));
    }

    const now = nowIso();
    if (wallets.length > 0) {
      const stmts: BatchItem<'sqlite'>[] = wallets.map((w) => {
        const personalNet = netByWallet.get(w.id) ?? 0;
        const entryCount = w.entryCount;
        const vndValue = vndValues.get(w.id) ?? null;
        const cashVnd = cashVndValues.get(w.id) ?? null;
        const holdingsJson = JSON.stringify(holdingsByWallet.get(w.id) ?? []);
        return db
          .insert(personalWalletBalances)
          .values({
            walletId: w.id,
            userId,
            personalNet,
            entryCount,
            vndValue,
            cashVnd,
            holdingsJson,
            needsReplay: 0,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: personalWalletBalances.walletId,
            set: {
              personalNet,
              entryCount,
              vndValue,
              cashVnd,
              holdingsJson,
              needsReplay: 0,
              updatedAt: now,
            },
          }) as unknown as BatchItem<'sqlite'>;
      });
      await db.batch([stmts[0]!, ...stmts.slice(1)]);
    }

    const vnd = vndTotalFromCache(wallets, walletBalances, vndValues, cashVndValues, holdingsByWallet);
    return { wallets, vnd, walletBalances, vndValues, holdingsByWallet };
  }

  const defaultWalletId = wallets.find((w) => w.isDefault)?.id ?? null;
  const fallbackVndWalletId = pickFallbackVndWallet(wallets, defaultWalletId);
  const vndWalletIds = new Set(wallets.filter((w) => w.currency === 'VND').map((w) => w.id));
  const resolvedGroupDeltas = new Map<string, number>();
  for (const [key, delta] of rawGroupDeltas) {
    const targetId = key !== DEFAULT_WALLET_DELTA_KEY && vndWalletIds.has(key) ? key : fallbackVndWalletId;
    if (targetId !== null) {
      resolvedGroupDeltas.set(targetId, (resolvedGroupDeltas.get(targetId) ?? 0) + delta);
    }
  }

  const walletBalances = new Map<string, number>();
  const vndValues = new Map<string, number | null>();
  const cashVndValues = new Map<string, number | null>();
  const holdingsByWallet = new Map<string, Holding[]>();

  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i]!;
    const r = walletRows[i]!;
    const personalNet = Number(r.personalNet ?? 0);
    const groupDelta = w.currency === 'VND' ? (resolvedGroupDeltas.get(w.id) ?? 0) : 0;
    const balance = w.startAmount + personalNet + groupDelta;
    walletBalances.set(w.id, balance);

    const holdings = r.holdingsJson ? (JSON.parse(r.holdingsJson) as Holding[]) : [];
    holdingsByWallet.set(w.id, holdings);

    if (w.currency === 'VND') {
      let holdingsVnd = 0;
      for (const h of holdings) holdingsVnd += h.cost;
      cashVndValues.set(w.id, balance);
      vndValues.set(w.id, balance + holdingsVnd);
    } else {
      cashVndValues.set(w.id, r.cachedCashVnd ?? null);
      vndValues.set(w.id, r.cachedVndValue ?? null);
    }
  }

  const vnd = vndTotalFromCache(wallets, walletBalances, vndValues, cashVndValues, holdingsByWallet);
  return { wallets, vnd, walletBalances, vndValues, holdingsByWallet };
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
  excludeFromReports: boolean;
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

  let excludeFromReports = false;
  if (input.excludeFromReports !== undefined) {
    if (typeof input.excludeFromReports !== 'boolean') {
      throw new ApiError('VALIDATION', 422, 'Invalid excludeFromReports');
    }
    excludeFromReports = input.excludeFromReports;
  }

  return { name, currency, kind, startAmount, startDate, startCostVnd, icon, excludeFromReports };
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
    excludeFromReports: Boolean(w.excludeFromReports),
  };
}

export function walletRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/personal/wallets', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);

    const { wallets: calcWallets, walletBalances, vndValues } = await loadCachedWalletsSummary(
      db,
      user.id,
    );

    const wallets: WalletDetailView[] = calcWallets.map((w) => ({
      id: w.id,
      name: w.name,
      currency: w.currency,
      balance: walletBalances.get(w.id) ?? w.startAmount,
      isDefault: w.isDefault,
      kind: w.kind,
      startAmount: w.startAmount,
      startDate: w.startDate,
      startCostVnd: w.startCostVnd,
      vndValue: vndValues.get(w.id) ?? null,
      icon: w.icon,
      sortOrder: w.sortOrder,
      archived: w.archived,
      entryCount: w.entryCount,
      excludeFromReports: Boolean(w.excludeFromReports),
    }));

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
    const initialVndValue =
      validated.currency !== 'VND' && validated.startCostVnd !== null && validated.startAmount !== 0
        ? validated.startCostVnd
        : null;

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
        db.insert(personalWalletOptions).values({
          walletId,
          userId: user.id,
          excludeFromReports: validated.excludeFromReports ? 1 : 0,
          updatedAt: now,
        }),
        initWalletBalanceStmt(db, user.id, walletId, now, {
          vndValue: initialVndValue,
          cashVnd: initialVndValue,
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
      excludeFromReports: validated.excludeFromReports,
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
    const initialVndValue =
      validated.currency !== 'VND' && validated.startCostVnd !== null && validated.startAmount !== 0
        ? validated.startCostVnd
        : null;

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
        db.insert(personalWalletOptions).values({
          walletId,
          userId: user.id,
          excludeFromReports: validated.excludeFromReports ? 1 : 0,
          updatedAt: now,
        }),
        initWalletBalanceStmt(db, user.id, walletId, now, {
          vndValue: initialVndValue,
          cashVnd: initialVndValue,
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
      excludeFromReports: validated.excludeFromReports,
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
        excludeFromReports: personalWalletOptions.excludeFromReports,
      })
      .from(personalWallets)
      .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
      .leftJoin(personalWalletOptions, eq(personalWalletOptions.walletId, personalWallets.id))
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
    const currentExcludeFromReports = Boolean(existing.excludeFromReports);

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

    let nextExcludeFromReports = currentExcludeFromReports;
    if (body.excludeFromReports !== undefined) {
      if (typeof body.excludeFromReports !== 'boolean') {
        throw new ApiError('VALIDATION', 422, 'Invalid excludeFromReports');
      }
      nextExcludeFromReports = body.excludeFromReports;
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

    if (
      nextKind === 'investment' &&
      (nextStartDate !== currentStartDate || nextStartAmount !== currentStartAmount)
    ) {
      const tradeRows = await db
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
          assetId: personalTransactions.assetId,
          quantity: personalTransactions.quantity,
        })
        .from(personalTransactions)
        .where(
          and(
            eq(personalTransactions.userId, user.id),
            eq(personalTransactions.walletId, walletId),
            inArray(personalTransactions.type, ['buy', 'sell']),
          ),
        )
        .all();

      const calcWallet: CalcWallet = {
        id: walletId,
        currency: nextCurrency,
        startAmount: nextStartAmount,
        startDate: nextStartDate,
        startCostVnd: nextStartCostVnd,
        archived: nextArchived,
      };
      const calcEntries: CalcEntry[] = tradeRows.map((r) => ({
        id: r.id,
        walletId: r.walletId,
        type: r.type as PersonalEntryType,
        amount: r.amount,
        date: r.date,
        time: r.time ?? null,
        createdAt: r.createdAt,
        transferId: r.transferId ?? null,
        excludeFromReports: Boolean(r.excludeFromReports),
        assetId: r.assetId ?? null,
        quantity: r.quantity ?? null,
      }));
      const oversell = findOversell(calcWallet, calcEntries);
      if (oversell) {
        throw new ApiError('OVERSELL', 422, 'Insufficient asset quantity', {
          details: oversell,
        });
      }
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
      db
        .insert(personalWalletOptions)
        .values({
          walletId,
          userId: user.id,
          excludeFromReports: nextExcludeFromReports ? 1 : 0,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: personalWalletOptions.walletId,
          set: {
            excludeFromReports: nextExcludeFromReports ? 1 : 0,
            updatedAt: now,
          },
        }),
    );

    const isNonVndOrInv =
      nextCurrency !== 'VND' ||
      nextKind === 'investment' ||
      currentCurrency !== 'VND' ||
      currentKind === 'investment';
    const replayAffectingChange =
      nextStartAmount !== currentStartAmount ||
      nextStartDate !== currentStartDate ||
      nextStartCostVnd !== currentStartCostVnd ||
      nextCurrency !== currentCurrency;
    if (isNonVndOrInv && replayAffectingChange) {
      stmts.push(
        ...walletBalanceDeltaStmts(
          db,
          user.id,
          [{ walletId, netDelta: 0, countDelta: 0, needsReplay: true }],
          now,
        ),
      );
    }

    try {
      await db.batch([stmts[0]!, ...stmts.slice(1)]);
    } catch (err) {
      if (isDbError(err, 'UNIQUE constraint failed') || isDbError(err, 'UNIQUE')) {
        throw new ApiError('ALREADY_HANDLED', 409, 'You already have a default wallet.');
      }
      throw err;
    }

    const { wallets: calcWallets, walletBalances, vndValues } = await loadCachedWalletsSummary(
      db,
      user.id,
    );
    const updated = calcWallets.find((w) => w.id === walletId)!;
    const wallet: WalletDetailView = {
      id: updated.id,
      name: updated.name,
      currency: updated.currency,
      balance: walletBalances.get(updated.id) ?? updated.startAmount,
      isDefault: updated.isDefault,
      kind: updated.kind,
      startAmount: updated.startAmount,
      startDate: updated.startDate,
      startCostVnd: updated.startCostVnd,
      vndValue: vndValues.get(updated.id) ?? null,
      icon: updated.icon,
      sortOrder: updated.sortOrder,
      archived: updated.archived,
      entryCount,
      excludeFromReports: Boolean(updated.excludeFromReports),
    };

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
      db.delete(personalWalletOptions).where(eq(personalWalletOptions.walletId, walletId)),
      db.delete(personalWalletSettings).where(eq(personalWalletSettings.walletId, walletId)),
      db
        .delete(personalWallets)
        .where(and(eq(personalWallets.id, walletId), eq(personalWallets.userId, user.id))),
    ]);

    return c.json({ ok: true }, 200);
  });

  return app;
}
