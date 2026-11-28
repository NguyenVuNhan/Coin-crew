import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '@cc/api-db/client';
import {
  personalAssets,
  personalCategories,
  personalTags,
  personalTransactions,
  personalTransactionTags,
  personalWallets,
  personalWalletSettings,
} from '@cc/api-db/schema';
import { commitPersonalWrite } from '@cc/api-db/personalSync';
import { ApiError } from '@cc/api-util/errors';
import { newId } from '@cc/api-util/ids';
import {
  findOversell,
  isBeforeStart,
  isValidAmount,
  isValidQuantity,
  type CalcEntry,
  type CalcWallet,
  type CurrencyCode,
  type EntryInput,
  type EntryView,
  type PersonalEntryType,
  type WalletKind,
} from '@cc/core';
import {
  assetCountDeltaStmts,
  markAllNonVndOrInvestmentReplayStmt,
  signedPersonalAmount,
  walletBalanceDeltaStmts,
} from './balanceCache';

export interface EntryWriteOptions {
  source: 'manual' | 'recurring';
  externalRef: string | null;
  now: string;
}

export interface WalletInfo {
  id: string;
  currency: CurrencyCode;
  kind: WalletKind;
  startAmount: number;
  startDate: string;
  startCostVnd: number | null;
  archived: boolean;
}

export function walletNeedsReplay(w: { currency: CurrencyCode; kind: WalletKind }): boolean {
  return w.currency !== 'VND' || w.kind === 'investment';
}

export async function loadWalletsMap(
  db: Db,
  userId: string,
  walletIds: string[],
): Promise<Map<string, WalletInfo>> {
  const uniqueIds = [...new Set(walletIds)];
  const rows = await db
    .select({
      id: personalWallets.id,
      currency: personalWallets.currency,
      startAmount: personalWallets.startAmount,
      startDate: personalWallets.startDate,
      kind: personalWalletSettings.kind,
      startCostVnd: personalWalletSettings.startCostVnd,
      archivedAt: personalWalletSettings.archivedAt,
    })
    .from(personalWallets)
    .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
    .where(and(eq(personalWallets.userId, userId), inArray(personalWallets.id, uniqueIds)))
    .all();

  const map = new Map<string, WalletInfo>();
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      currency: r.currency as CurrencyCode,
      kind: (r.kind ?? 'everyday') as WalletKind,
      startAmount: r.startAmount,
      startDate: r.startDate,
      startCostVnd: r.startCostVnd ?? null,
      archived: r.archivedAt !== null && r.archivedAt !== undefined,
    });
  }

  for (const wid of uniqueIds) {
    if (!map.has(wid)) {
      throw new ApiError('NOT_FOUND', 404, 'Wallet not found');
    }
  }
  for (const wid of uniqueIds) {
    if (map.get(wid)!.archived) {
      throw new ApiError('VALIDATION', 422, 'Wallet is archived');
    }
  }

  return map;
}

export async function requireCategory(
  db: Db,
  userId: string,
  categoryId: string,
  expectedType: 'expense' | 'income',
  allowHidden = false,
): Promise<void> {
  const cat = await db
    .select({
      id: personalCategories.id,
      type: personalCategories.type,
      hidden: personalCategories.hidden,
    })
    .from(personalCategories)
    .where(and(eq(personalCategories.id, categoryId), eq(personalCategories.userId, userId)))
    .get();

  if (!cat) {
    throw new ApiError('NOT_FOUND', 404, 'Category not found');
  }
  if (cat.type !== expectedType || (!allowHidden && Boolean(cat.hidden))) {
    throw new ApiError('VALIDATION', 422, 'Invalid category');
  }
}

export async function requireAsset(
  db: Db,
  userId: string,
  assetId: string,
  allowHidden = false,
): Promise<void> {
  const asset = await db
    .select({
      id: personalAssets.id,
      hidden: personalAssets.hidden,
    })
    .from(personalAssets)
    .where(and(eq(personalAssets.id, assetId), eq(personalAssets.userId, userId)))
    .get();

  if (!asset) {
    throw new ApiError('NOT_FOUND', 404, 'Asset not found');
  }
  if (!allowHidden && Boolean(asset.hidden)) {
    throw new ApiError('VALIDATION', 422, 'Asset is hidden');
  }
}

export async function loadWalletTrades(
  db: Db,
  userId: string,
  walletId: string,
): Promise<CalcEntry[]> {
  const rows = await db
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
        eq(personalTransactions.userId, userId),
        eq(personalTransactions.walletId, walletId),
        inArray(personalTransactions.type, ['buy', 'sell']),
      ),
    )
    .all();

  return rows.map((r) => ({
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
}

export function assertNoOversell(
  wallet: Pick<CalcWallet, 'id' | 'currency' | 'startAmount' | 'startDate' | 'startCostVnd' | 'archived'>,
  trades: CalcEntry[],
): void {
  const oversell = findOversell(wallet, trades);
  if (oversell) {
    throw new ApiError('OVERSELL', 422, 'Insufficient asset quantity', {
      details: oversell,
    });
  }
}

async function planTags(
  db: Db,
  userId: string,
  names: string[],
  now: string,
): Promise<{ tags: { id: string; name: string }[]; insertStmts: BatchItem<'sqlite'>[] }> {
  if (names.length === 0) {
    return { tags: [], insertStmts: [] };
  }

  const seenLower = new Set<string>();
  const uniqueNames: string[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    if (!seenLower.has(lower)) {
      seenLower.add(lower);
      uniqueNames.push(name);
    }
  }

  const lowerNames = uniqueNames.map((n) => n.toLowerCase());
  const rows = await db
    .select({
      id: personalTags.id,
      name: personalTags.name,
    })
    .from(personalTags)
    .where(
      and(
        eq(personalTags.userId, userId),
        inArray(sql`lower(${personalTags.name})`, lowerNames),
      ),
    )
    .all();

  const byLower = new Map<string, { id: string; name: string }>();
  for (const r of rows) {
    byLower.set(r.name.toLowerCase(), r);
  }

  const missing: { id: string; name: string }[] = [];
  const resolved: { id: string; name: string }[] = [];
  for (const name of uniqueNames) {
    const lower = name.toLowerCase();
    const existing = byLower.get(lower);
    if (existing) {
      resolved.push(existing);
    } else {
      const created = { id: newId(), name };
      byLower.set(lower, created);
      missing.push(created);
      resolved.push(created);
    }
  }

  const insertStmts: BatchItem<'sqlite'>[] =
    missing.length > 0
      ? [
          db
            .insert(personalTags)
            .values(
              missing.map((t) => ({
                id: t.id,
                userId,
                name: t.name,
                createdAt: now,
              })),
            )
            .onConflictDoNothing() as unknown as BatchItem<'sqlite'>,
        ]
      : [];

  return { tags: resolved, insertStmts };
}

export async function resolveTags(
  db: Db,
  userId: string,
  names: string[],
  now: string,
): Promise<{ id: string; name: string }[]> {
  if (names.length === 0) return [];

  await db
    .insert(personalTags)
    .values(
      names.map((name) => ({
        id: newId(),
        userId,
        name,
        createdAt: now,
      })),
    )
    .onConflictDoNothing();

  const lowerNames = names.map((n) => n.toLowerCase());
  const rows = await db
    .select({
      id: personalTags.id,
      name: personalTags.name,
    })
    .from(personalTags)
    .where(
      and(
        eq(personalTags.userId, userId),
        inArray(sql`lower(${personalTags.name})`, lowerNames),
      ),
    )
    .all();

  const byLower = new Map<string, { id: string; name: string }>();
  for (const r of rows) {
    byLower.set(r.name.toLowerCase(), r);
  }

  return names.map((n) => byLower.get(n.toLowerCase())!);
}

export function resolveTransferAmounts(
  amountSent: number,
  amountReceived: number | undefined,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode,
): number {
  if (!isValidAmount(amountSent, fromCurrency)) {
    throw new ApiError('VALIDATION', 422, 'Invalid amountSent');
  }
  if (fromCurrency === toCurrency) {
    if (amountReceived !== undefined && amountReceived !== amountSent) {
      throw new ApiError('VALIDATION', 422, 'Invalid amountReceived for same-currency transfer');
    }
    return amountSent;
  }
  if (amountReceived === undefined || !isValidAmount(amountReceived, toCurrency)) {
    throw new ApiError('VALIDATION', 422, 'Invalid amountReceived');
  }
  return amountReceived;
}

export function buildEntryView(params: {
  id: string;
  wallet: WalletInfo;
  type: PersonalEntryType;
  amount: number;
  categoryId: string | null;
  assetId?: string | null;
  quantity?: number | null;
  transferId: string | null;
  counterpartWalletId: string | null;
  date: string;
  time: string | null;
  note: string | null;
  tags: string[];
  excludeFromReports: boolean;
  source?: 'manual' | 'adjustment' | 'recurring';
  externalRef?: string | null;
  createdAt: string;
}): EntryView {
  const source: EntryView['source'] = params.source ?? 'manual';
  const ruleId =
    source === 'recurring' && params.externalRef
      ? (params.externalRef.split(':')[0] || null)
      : null;

  return {
    id: params.id,
    walletId: params.wallet.id,
    type: params.type,
    amount: params.amount,
    currency: params.wallet.currency,
    categoryId: params.categoryId,
    assetId: params.assetId ?? null,
    quantity: params.quantity ?? null,
    transferId: params.transferId,
    counterpartWalletId: params.counterpartWalletId,
    date: params.date,
    time: params.time,
    note: params.note,
    tags: params.tags,
    excludeFromReports: params.excludeFromReports,
    source,
    ruleId,
    beforeStart: isBeforeStart({ date: params.date }, { startDate: params.wallet.startDate }),
    createdAt: params.createdAt,
  };
}

/** Validates (wallet, category, asset, oversell, amounts) exactly as POST /me/personal/transactions does, and returns the batch items without running them. */
export async function prepareEntryWrite(
  db: Db,
  userId: string,
  input: EntryInput,
  opts: EntryWriteOptions,
): Promise<{ items: (v: SQL) => BatchItem<'sqlite'>[]; entries: EntryView[] }> {
  const { source, externalRef, now } = opts;

  if (input.type === 'buy' || input.type === 'sell') {
    if (typeof input.quantity !== 'number' || !isValidQuantity(input.quantity)) {
      throw new ApiError('VALIDATION', 422, 'Invalid quantity');
    }
    const wallets = await loadWalletsMap(db, userId, [input.walletId]);
    const wallet = wallets.get(input.walletId)!;
    if (wallet.kind !== 'investment') {
      throw new ApiError('VALIDATION', 422, 'Wallet must be an investment wallet');
    }
    if (!isValidAmount(input.amount, wallet.currency)) {
      throw new ApiError('VALIDATION', 422, 'Invalid amount');
    }

    await requireAsset(db, userId, input.assetId, false);

    const txId = newId();
    const existingTrades = await loadWalletTrades(db, userId, wallet.id);
    const nextTrades: CalcEntry[] = [
      ...existingTrades,
      {
        id: txId,
        walletId: wallet.id,
        type: input.type,
        amount: input.amount,
        date: input.date,
        time: input.time ?? null,
        createdAt: now,
        transferId: null,
        excludeFromReports: false,
        assetId: input.assetId,
        quantity: input.quantity,
      },
    ];
    assertNoOversell(wallet, nextTrades);

    const tagPlan = await planTags(db, userId, input.tags ?? [], now);

    const entry = buildEntryView({
      id: txId,
      wallet,
      type: input.type,
      amount: input.amount,
      categoryId: null,
      assetId: input.assetId,
      quantity: input.quantity,
      transferId: null,
      counterpartWalletId: null,
      date: input.date,
      time: input.time ?? null,
      note: input.note ?? null,
      tags: tagPlan.tags.map((t) => t.name),
      excludeFromReports: false,
      source,
      externalRef,
      createdAt: now,
    });

    const items = (v: SQL): BatchItem<'sqlite'>[] => [
      ...tagPlan.insertStmts,
      db.insert(personalTransactions).values({
        id: txId,
        userId,
        walletId: wallet.id,
        type: input.type,
        amount: input.amount,
        categoryId: null,
        transferId: null,
        assetId: input.assetId,
        quantity: input.quantity,
        date: input.date,
        time: input.time ?? null,
        note: input.note ?? null,
        excludeFromReports: 0,
        source,
        externalRef,
        createdAt: now,
        updatedAt: now,
        syncVersion: v,
      }) as unknown as BatchItem<'sqlite'>,
      ...tagPlan.tags.map(
        (t) =>
          db.insert(personalTransactionTags).values({
            transactionId: txId,
            tagId: t.id,
          }) as unknown as BatchItem<'sqlite'>,
      ),
      ...walletBalanceDeltaStmts(
        db,
        userId,
        [
          {
            walletId: wallet.id,
            netDelta: signedPersonalAmount(input.type, input.amount),
            countDelta: 1,
            needsReplay: true,
          },
        ],
        now,
      ),
      ...assetCountDeltaStmts(db, userId, [{ assetId: input.assetId, delta: 1 }]),
    ];

    return { items, entries: [entry] };
  }

  if (input.type === 'expense' || input.type === 'income') {
    const wallets = await loadWalletsMap(db, userId, [input.walletId]);
    const wallet = wallets.get(input.walletId)!;

    if (!isValidAmount(input.amount, wallet.currency)) {
      throw new ApiError('VALIDATION', 422, 'Invalid amount');
    }

    const allowHidden = false;
    await requireCategory(db, userId, input.categoryId, input.type, allowHidden);

    const tagPlan = await planTags(db, userId, input.tags ?? [], now);
    const txId = newId();

    const entry = buildEntryView({
      id: txId,
      wallet,
      type: input.type,
      amount: input.amount,
      categoryId: input.categoryId,
      transferId: null,
      counterpartWalletId: null,
      date: input.date,
      time: input.time ?? null,
      note: input.note ?? null,
      tags: tagPlan.tags.map((t) => t.name),
      excludeFromReports: Boolean(input.excludeFromReports),
      source,
      externalRef,
      createdAt: now,
    });

    const items = (v: SQL): BatchItem<'sqlite'>[] => [
      ...tagPlan.insertStmts,
      db.insert(personalTransactions).values({
        id: txId,
        userId,
        walletId: wallet.id,
        type: input.type,
        amount: input.amount,
        categoryId: input.categoryId,
        transferId: null,
        date: input.date,
        time: input.time ?? null,
        note: input.note ?? null,
        excludeFromReports: input.excludeFromReports ? 1 : 0,
        source,
        externalRef,
        createdAt: now,
        updatedAt: now,
        syncVersion: v,
      }) as unknown as BatchItem<'sqlite'>,
      ...tagPlan.tags.map(
        (t) =>
          db.insert(personalTransactionTags).values({
            transactionId: txId,
            tagId: t.id,
          }) as unknown as BatchItem<'sqlite'>,
      ),
      ...walletBalanceDeltaStmts(
        db,
        userId,
        [
          {
            walletId: wallet.id,
            netDelta: signedPersonalAmount(input.type, input.amount),
            countDelta: 1,
            needsReplay: walletNeedsReplay(wallet),
          },
        ],
        now,
      ),
    ];

    return { items, entries: [entry] };
  }

  if (input.type !== 'transfer') {
    throw new ApiError('NOT_IMPLEMENTED', 501, 'Not implemented');
  }

  if (input.fromWalletId === input.toWalletId) {
    throw new ApiError('VALIDATION', 422, 'Transfer wallets must differ');
  }

  const wallets = await loadWalletsMap(db, userId, [input.fromWalletId, input.toWalletId]);
  const fromWallet = wallets.get(input.fromWalletId)!;
  const toWallet = wallets.get(input.toWalletId)!;

  const amountReceived = resolveTransferAmounts(
    input.amountSent,
    input.amountReceived,
    fromWallet.currency,
    toWallet.currency,
  );

  const tagPlan = await planTags(db, userId, input.tags ?? [], now);
  const transferId = newId();
  const outId = newId();
  const inId = newId();
  const excludeFromReports = input.excludeFromReports ?? true;
  const excludeInt = excludeFromReports ? 1 : 0;
  const outExternalRef = externalRef;
  const inExternalRef = externalRef !== null ? `${externalRef}:in` : null;

  const tagNames = tagPlan.tags.map((t) => t.name);
  const outEntry = buildEntryView({
    id: outId,
    wallet: fromWallet,
    type: 'transfer_out',
    amount: input.amountSent,
    categoryId: null,
    transferId,
    counterpartWalletId: toWallet.id,
    date: input.date,
    time: input.time ?? null,
    note: input.note ?? null,
    tags: tagNames,
    excludeFromReports,
    source,
    externalRef: outExternalRef,
    createdAt: now,
  });
  const inEntry = buildEntryView({
    id: inId,
    wallet: toWallet,
    type: 'transfer_in',
    amount: amountReceived,
    categoryId: null,
    transferId,
    counterpartWalletId: fromWallet.id,
    date: input.date,
    time: input.time ?? null,
    note: input.note ?? null,
    tags: tagNames,
    excludeFromReports,
    source,
    externalRef: inExternalRef,
    createdAt: now,
  });

  const items = (v: SQL): BatchItem<'sqlite'>[] => [
    ...tagPlan.insertStmts,
    db.insert(personalTransactions).values({
      id: outId,
      userId,
      walletId: fromWallet.id,
      type: 'transfer_out',
      amount: input.amountSent,
      categoryId: null,
      transferId,
      date: input.date,
      time: input.time ?? null,
      note: input.note ?? null,
      excludeFromReports: excludeInt,
      source,
      externalRef: outExternalRef,
      createdAt: now,
      updatedAt: now,
      syncVersion: v,
    }) as unknown as BatchItem<'sqlite'>,
    db.insert(personalTransactions).values({
      id: inId,
      userId,
      walletId: toWallet.id,
      type: 'transfer_in',
      amount: amountReceived,
      categoryId: null,
      transferId,
      date: input.date,
      time: input.time ?? null,
      note: input.note ?? null,
      excludeFromReports: excludeInt,
      source,
      externalRef: inExternalRef,
      createdAt: now,
      updatedAt: now,
      syncVersion: v,
    }) as unknown as BatchItem<'sqlite'>,
    ...tagPlan.tags.map(
      (t) =>
        db.insert(personalTransactionTags).values({
          transactionId: outId,
          tagId: t.id,
        }) as unknown as BatchItem<'sqlite'>,
    ),
    ...tagPlan.tags.map(
      (t) =>
        db.insert(personalTransactionTags).values({
          transactionId: inId,
          tagId: t.id,
        }) as unknown as BatchItem<'sqlite'>,
    ),
    ...walletBalanceDeltaStmts(
      db,
      userId,
      [
        {
          walletId: fromWallet.id,
          netDelta: -input.amountSent,
          countDelta: 1,
          needsReplay: walletNeedsReplay(fromWallet),
        },
        {
          walletId: toWallet.id,
          netDelta: amountReceived,
          countDelta: 1,
          needsReplay: walletNeedsReplay(toWallet),
        },
      ],
      now,
    ),
    ...(fromWallet.currency !== 'VND' || toWallet.currency !== 'VND'
      ? [markAllNonVndOrInvestmentReplayStmt(db, userId, now)]
      : []),
  ];

  return { items, entries: [outEntry, inEntry] };
}

/** prepare + commitPersonalWrite in one call. */
export async function writeEntry(
  db: Db,
  userId: string,
  input: EntryInput,
  opts: EntryWriteOptions,
): Promise<EntryView[]> {
  const { items, entries } = await prepareEntryWrite(db, userId, input, opts);
  await commitPersonalWrite(db, userId, items);
  return entries;
}
