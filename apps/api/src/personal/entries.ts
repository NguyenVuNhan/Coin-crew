import { Hono } from 'hono';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import {
  personalPlannedItems,
  personalRecurringRules,
  personalTags,
  personalTransactions,
  personalTransactionTags,
  personalWallets,
  personalWalletSettings,
} from '@cc/api-db/schema';
import {
  clearDeletions,
  commitPersonalWrite,
  recordDeletions,
} from '@cc/api-db/personalSync';
import { getSessionUser } from '@cc/api-auth/session';
import { requirePersonal } from '@cc/api-auth/personal';
import { ApiError, isDbError } from '@cc/api-util/errors';
import { nowIso } from '@cc/api-util/ids';
import {
  isValidAmount,
  isValidQuantity,
  vnDate,
  type CalcEntry,
  type CurrencyCode,
  type EntryView,
  type PersonalEntryType,
  type WalletKind,
} from '@cc/core';
import { parseEntryInput, parseNote, parseTags } from './entryInput';
import {
  assetCountDeltaStmts,
  markAllNonVndOrInvestmentReplayStmt,
  signedPersonalAmount,
  walletBalanceDeltaStmts,
} from './balanceCache';
import {
  assertNoOversell,
  buildEntryView,
  loadWalletsMap,
  loadWalletTrades,
  requireAsset,
  requireCategory,
  resolveTags,
  resolveTransferAmounts,
  walletNeedsReplay,
  writeEntry,
} from './entryWrite';
import { optionalTime, parseJson, requireDate } from './validate';

async function loadWalletFlagsMap(
  db: Db,
  userId: string,
  walletIds: string[],
): Promise<Map<string, { currency: CurrencyCode; kind: WalletKind }>> {
  const uniqueIds = [...new Set(walletIds)];
  if (uniqueIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: personalWallets.id,
      currency: personalWallets.currency,
      kind: personalWalletSettings.kind,
    })
    .from(personalWallets)
    .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
    .where(and(eq(personalWallets.userId, userId), inArray(personalWallets.id, uniqueIds)))
    .all();

  return new Map(
    rows.map((r) => [
      r.id,
      { currency: r.currency as CurrencyCode, kind: (r.kind ?? 'everyday') as WalletKind },
    ]),
  );
}

interface ParsedRestoreItem {
  id: string;
  walletId: string;
  type: PersonalEntryType;
  amount: number;
  categoryId: string | null;
  assetId: string | null;
  quantity: number | null;
  transferId: string | null;
  date: string;
  time: string | null;
  note: string | null;
  tags: string[];
  excludeFromReports: boolean;
  createdAt: string;
}

function sameTagSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b.map((t) => t.toLowerCase()));
  return a.every((t) => setB.has(t.toLowerCase()));
}

function parseRestoreItem(raw: unknown): ParsedRestoreItem {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError('VALIDATION', 422, 'Invalid entry');
  }
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || e.id.trim().length === 0) {
    throw new ApiError('VALIDATION', 422, 'Invalid id');
  }
  if (typeof e.walletId !== 'string' || e.walletId.trim().length === 0) {
    throw new ApiError('VALIDATION', 422, 'Invalid walletId');
  }
  if (
    e.type !== 'expense' &&
    e.type !== 'income' &&
    e.type !== 'transfer_out' &&
    e.type !== 'transfer_in' &&
    e.type !== 'buy' &&
    e.type !== 'sell'
  ) {
    throw new ApiError('VALIDATION', 422, 'Invalid type');
  }
  if (typeof e.amount !== 'number' || !Number.isSafeInteger(e.amount) || e.amount <= 0) {
    throw new ApiError('VALIDATION', 422, 'Invalid amount');
  }

  let categoryId: string | null = null;
  if (e.type === 'expense' || e.type === 'income') {
    if (typeof e.categoryId !== 'string' || e.categoryId.trim().length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid categoryId');
    }
    categoryId = e.categoryId;
  } else if (e.categoryId !== undefined && e.categoryId !== null) {
    throw new ApiError('VALIDATION', 422, 'Entry cannot have categoryId');
  }

  let assetId: string | null = null;
  let quantity: number | null = null;
  if (e.type === 'buy' || e.type === 'sell') {
    if (typeof e.assetId !== 'string' || e.assetId.trim().length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid assetId');
    }
    if (typeof e.quantity !== 'number' || !isValidQuantity(e.quantity)) {
      throw new ApiError('VALIDATION', 422, 'Invalid quantity');
    }
    assetId = e.assetId;
    quantity = e.quantity;
  } else {
    if (e.assetId !== undefined && e.assetId !== null) {
      throw new ApiError('VALIDATION', 422, 'Non-trade cannot have assetId');
    }
    if (e.quantity !== undefined && e.quantity !== null) {
      throw new ApiError('VALIDATION', 422, 'Non-trade cannot have quantity');
    }
  }

  let transferId: string | null = null;
  if (e.type === 'transfer_out' || e.type === 'transfer_in') {
    if (typeof e.transferId !== 'string' || e.transferId.trim().length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid transferId');
    }
    transferId = e.transferId;
  } else if (e.transferId !== undefined && e.transferId !== null) {
    throw new ApiError('VALIDATION', 422, 'Non-transfer cannot have transferId');
  }

  const date = requireDate(e.date);
  const time = optionalTime(e.time);
  const note = parseNote(e.note);
  const tags = parseTags(e.tags);

  if (e.excludeFromReports !== undefined && typeof e.excludeFromReports !== 'boolean') {
    throw new ApiError('VALIDATION', 422, 'Invalid excludeFromReports');
  }
  const excludeFromReports =
    e.type === 'buy' || e.type === 'sell'
      ? false
      : (e.excludeFromReports ?? (e.type === 'transfer_out' || e.type === 'transfer_in'));

  if (typeof e.createdAt !== 'string') {
    throw new ApiError('VALIDATION', 422, 'Invalid createdAt');
  }
  const parsedMs = Date.parse(e.createdAt);
  if (Number.isNaN(parsedMs) || new Date(parsedMs).toISOString() !== e.createdAt) {
    throw new ApiError('VALIDATION', 422, 'Invalid createdAt');
  }
  const createdAt = e.createdAt;

  return {
    id: e.id,
    walletId: e.walletId,
    type: e.type,
    amount: e.amount,
    categoryId,
    assetId,
    quantity,
    transferId,
    date,
    time,
    note,
    tags,
    excludeFromReports,
    createdAt,
  };
}

export function entryRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.post('/me/personal/transactions', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const rawBody = await parseJson(c);
    const input = parseEntryInput(rawBody);
    const db = getDb(c.env);
    const now = nowIso();
    const entries = await writeEntry(db, user.id, input, {
      source: 'manual',
      externalRef: null,
      now,
    });
    return c.json({ entries }, 201);
  });

  app.patch('/me/personal/transactions/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const rawBody = await parseJson(c);
    const input = parseEntryInput(rawBody);
    const db = getDb(c.env);
    const now = nowIso();

    const target = await db
      .select({
        id: personalTransactions.id,
        walletId: personalTransactions.walletId,
        type: personalTransactions.type,
        amount: personalTransactions.amount,
        categoryId: personalTransactions.categoryId,
        assetId: personalTransactions.assetId,
        transferId: personalTransactions.transferId,
        source: personalTransactions.source,
        externalRef: personalTransactions.externalRef,
        createdAt: personalTransactions.createdAt,
      })
      .from(personalTransactions)
      .where(and(eq(personalTransactions.id, id), eq(personalTransactions.userId, user.id)))
      .get();

    if (!target) {
      throw new ApiError('NOT_FOUND', 404, 'Transaction not found');
    }

    // R14: editing a recurring transaction confirms its rule and resolves any open check-in
    const recurringRuleId =
      target.source === 'recurring' && target.externalRef && target.externalRef.includes(':')
        ? target.externalRef.slice(0, target.externalRef.indexOf(':'))
        : null;
    const r14Stmts: BatchItem<'sqlite'>[] = recurringRuleId
      ? [
          db
            .update(personalRecurringRules)
            .set({ lastConfirmedOn: vnDate(new Date()), updatedAt: now })
            .where(
              and(
                eq(personalRecurringRules.id, recurringRuleId),
                eq(personalRecurringRules.userId, user.id),
              ),
            ) as unknown as BatchItem<'sqlite'>,
          db
            .update(personalPlannedItems)
            .set({ status: 'confirmed', resolvedAt: now })
            .where(
              and(
                eq(personalPlannedItems.userId, user.id),
                eq(personalPlannedItems.ruleId, recurringRuleId),
                eq(personalPlannedItems.kind, 'recurring_checkin'),
                eq(personalPlannedItems.status, 'waiting'),
              ),
            ) as unknown as BatchItem<'sqlite'>,
        ]
      : [];

    const targetIsTransfer = target.type === 'transfer_out' || target.type === 'transfer_in';
    const inputIsTransfer = input.type === 'transfer';
    if (targetIsTransfer !== inputIsTransfer) {
      throw new ApiError('VALIDATION', 422, 'Cannot change between transfer and non-transfer');
    }

    const targetIsTrade = target.type === 'buy' || target.type === 'sell';
    const inputIsTrade = input.type === 'buy' || input.type === 'sell';
    if (targetIsTrade !== inputIsTrade) {
      throw new ApiError('VALIDATION', 422, 'Cannot change between trade and non-trade');
    }

    if (input.type === 'buy' || input.type === 'sell') {
      const wallets = await loadWalletsMap(db, user.id, [target.walletId, input.walletId]);
      const oldWallet = wallets.get(target.walletId)!;
      const newWallet = wallets.get(input.walletId)!;

      if (newWallet.kind !== 'investment') {
        throw new ApiError('VALIDATION', 422, 'Wallet must be an investment wallet');
      }
      if (!isValidAmount(input.amount, newWallet.currency)) {
        throw new ApiError('VALIDATION', 422, 'Invalid amount');
      }

      const allowHidden = target.assetId === input.assetId;
      await requireAsset(db, user.id, input.assetId, allowHidden);

      const updatedEntry: CalcEntry = {
        id: target.id,
        walletId: newWallet.id,
        type: input.type,
        amount: input.amount,
        date: input.date,
        time: input.time ?? null,
        createdAt: target.createdAt,
        transferId: null,
        excludeFromReports: false,
        assetId: input.assetId,
        quantity: input.quantity,
      };

      if (oldWallet.id === newWallet.id) {
        const trades = await loadWalletTrades(db, user.id, newWallet.id);
        const nextTrades = trades.map((t) => (t.id === target.id ? updatedEntry : t));
        assertNoOversell(newWallet, nextTrades);
      } else {
        const oldTrades = await loadWalletTrades(db, user.id, oldWallet.id);
        assertNoOversell(
          oldWallet,
          oldTrades.filter((t) => t.id !== target.id),
        );
        const newTrades = await loadWalletTrades(db, user.id, newWallet.id);
        assertNoOversell(newWallet, [...newTrades, updatedEntry]);
      }

      const resolvedTags = await resolveTags(db, user.id, input.tags ?? [], now);

      await commitPersonalWrite(db, user.id, (v) => [
        db
          .update(personalTransactions)
          .set({
            walletId: newWallet.id,
            type: input.type,
            amount: input.amount,
            categoryId: null,
            assetId: input.assetId,
            quantity: input.quantity,
            date: input.date,
            time: input.time ?? null,
            note: input.note ?? null,
            excludeFromReports: 0,
            syncVersion: v,
            updatedAt: now,
          })
          .where(and(eq(personalTransactions.id, target.id), eq(personalTransactions.userId, user.id))),
        db
          .delete(personalTransactionTags)
          .where(eq(personalTransactionTags.transactionId, target.id)),
        ...resolvedTags.map((t) =>
          db.insert(personalTransactionTags).values({
            transactionId: target.id,
            tagId: t.id,
          }),
        ),
        ...walletBalanceDeltaStmts(
          db,
          user.id,
          [
            {
              walletId: oldWallet.id,
              netDelta: -signedPersonalAmount(target.type as PersonalEntryType, target.amount),
              countDelta: -1,
              needsReplay: true,
            },
            {
              walletId: newWallet.id,
              netDelta: signedPersonalAmount(input.type, input.amount),
              countDelta: 1,
              needsReplay: true,
            },
          ],
          now,
        ),
        ...assetCountDeltaStmts(db, user.id, [
          ...(target.assetId ? [{ assetId: target.assetId, delta: -1 }] : []),
          { assetId: input.assetId, delta: 1 },
        ]),
        ...r14Stmts,
      ]);

      const entry = buildEntryView({
        id: target.id,
        wallet: newWallet,
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
        tags: resolvedTags.map((t) => t.name),
        excludeFromReports: false,
        createdAt: target.createdAt,
      });

      return c.json({ entries: [entry] }, 200);
    }

    if (input.type === 'expense' || input.type === 'income') {
      const wallets = await loadWalletsMap(db, user.id, [input.walletId]);
      const wallet = wallets.get(input.walletId)!;

      if (!isValidAmount(input.amount, wallet.currency)) {
        throw new ApiError('VALIDATION', 422, 'Invalid amount');
      }

      const allowHidden = target.categoryId === input.categoryId;
      await requireCategory(db, user.id, input.categoryId, input.type, allowHidden);

      const resolvedTags = await resolveTags(db, user.id, input.tags ?? [], now);
      const oldFlagsMap =
        target.walletId !== wallet.id
          ? await loadWalletFlagsMap(db, user.id, [target.walletId])
          : null;
      const oldWalletNeedsReplay = oldFlagsMap
        ? walletNeedsReplay(oldFlagsMap.get(target.walletId)!)
        : walletNeedsReplay(wallet);

      await commitPersonalWrite(db, user.id, (v) => [
        db
          .update(personalTransactions)
          .set({
            walletId: wallet.id,
            type: input.type,
            amount: input.amount,
            categoryId: input.categoryId,
            date: input.date,
            time: input.time ?? null,
            note: input.note ?? null,
            excludeFromReports: input.excludeFromReports ? 1 : 0,
            syncVersion: v,
            updatedAt: now,
          })
          .where(and(eq(personalTransactions.id, target.id), eq(personalTransactions.userId, user.id))),
        db
          .delete(personalTransactionTags)
          .where(eq(personalTransactionTags.transactionId, target.id)),
        ...resolvedTags.map((t) =>
          db.insert(personalTransactionTags).values({
            transactionId: target.id,
            tagId: t.id,
          }),
        ),
        ...walletBalanceDeltaStmts(
          db,
          user.id,
          [
            {
              walletId: target.walletId,
              netDelta: -signedPersonalAmount(target.type as PersonalEntryType, target.amount),
              countDelta: -1,
              needsReplay: oldWalletNeedsReplay,
            },
            {
              walletId: wallet.id,
              netDelta: signedPersonalAmount(input.type, input.amount),
              countDelta: 1,
              needsReplay: walletNeedsReplay(wallet),
            },
          ],
          now,
        ),
        ...r14Stmts,
      ]);

      const entry = buildEntryView({
        id: target.id,
        wallet,
        type: input.type,
        amount: input.amount,
        categoryId: input.categoryId,
        transferId: null,
        counterpartWalletId: null,
        date: input.date,
        time: input.time ?? null,
        note: input.note ?? null,
        tags: resolvedTags.map((t) => t.name),
        excludeFromReports: Boolean(input.excludeFromReports),
        createdAt: target.createdAt,
      });

      return c.json({ entries: [entry] }, 200);
    }
    if (input.type !== 'transfer') {
      throw new ApiError('NOT_IMPLEMENTED', 501, 'Not implemented');
    }

    if (!target.transferId) {
      throw new ApiError('VALIDATION', 422, 'Missing transferId');
    }

    const pairRows = await db
      .select({
        id: personalTransactions.id,
        walletId: personalTransactions.walletId,
        type: personalTransactions.type,
        amount: personalTransactions.amount,
        createdAt: personalTransactions.createdAt,
      })
      .from(personalTransactions)
      .where(
        and(
          eq(personalTransactions.userId, user.id),
          eq(personalTransactions.transferId, target.transferId),
        ),
      )
      .all();

    const outRow = pairRows.find((r) => r.type === 'transfer_out');
    const inRow = pairRows.find((r) => r.type === 'transfer_in');
    if (!outRow || !inRow) {
      throw new ApiError('NOT_FOUND', 404, 'Transfer pair not found');
    }

    const wallets = await loadWalletsMap(db, user.id, [input.fromWalletId, input.toWalletId]);
    const fromWallet = wallets.get(input.fromWalletId)!;
    const toWallet = wallets.get(input.toWalletId)!;

    const amountReceived = resolveTransferAmounts(
      input.amountSent,
      input.amountReceived,
      fromWallet.currency,
      toWallet.currency,
    );

    const resolvedTags = await resolveTags(db, user.id, input.tags ?? [], now);
    const excludeInt = input.excludeFromReports ? 1 : 0;
    const oldTransferWalletIds = [outRow.walletId, inRow.walletId].filter(
      (wid) => wid !== fromWallet.id && wid !== toWallet.id,
    );
    const oldTransferFlags = await loadWalletFlagsMap(db, user.id, oldTransferWalletIds);
    const getTransferWalletFlags = (wid: string) =>
      wid === fromWallet.id
        ? fromWallet
        : wid === toWallet.id
          ? toWallet
          : oldTransferFlags.get(wid)!;
    const oldOutFlags = getTransferWalletFlags(outRow.walletId);
    const oldInFlags = getTransferWalletFlags(inRow.walletId);
    const touchesNonVnd =
      fromWallet.currency !== 'VND' ||
      toWallet.currency !== 'VND' ||
      oldOutFlags.currency !== 'VND' ||
      oldInFlags.currency !== 'VND';

    await commitPersonalWrite(db, user.id, (v) => [
      db
        .update(personalTransactions)
        .set({
          walletId: fromWallet.id,
          amount: input.amountSent,
          date: input.date,
          time: input.time ?? null,
          note: input.note ?? null,
          excludeFromReports: excludeInt,
          syncVersion: v,
          updatedAt: now,
        })
        .where(and(eq(personalTransactions.id, outRow.id), eq(personalTransactions.userId, user.id))),
      db
        .update(personalTransactions)
        .set({
          walletId: toWallet.id,
          amount: amountReceived,
          date: input.date,
          time: input.time ?? null,
          note: input.note ?? null,
          excludeFromReports: excludeInt,
          syncVersion: v,
          updatedAt: now,
        })
        .where(and(eq(personalTransactions.id, inRow.id), eq(personalTransactions.userId, user.id))),
      db
        .delete(personalTransactionTags)
        .where(inArray(personalTransactionTags.transactionId, [outRow.id, inRow.id])),
      ...resolvedTags.map((t) =>
        db.insert(personalTransactionTags).values({
          transactionId: outRow.id,
          tagId: t.id,
        }),
      ),
      ...resolvedTags.map((t) =>
        db.insert(personalTransactionTags).values({
          transactionId: inRow.id,
          tagId: t.id,
        }),
      ),
      ...walletBalanceDeltaStmts(
        db,
        user.id,
        [
          {
            walletId: outRow.walletId,
            netDelta: outRow.amount,
            countDelta: -1,
            needsReplay: walletNeedsReplay(oldOutFlags),
          },
          {
            walletId: inRow.walletId,
            netDelta: -inRow.amount,
            countDelta: -1,
            needsReplay: walletNeedsReplay(oldInFlags),
          },
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
      ...(touchesNonVnd ? [markAllNonVndOrInvestmentReplayStmt(db, user.id, now)] : []),
      ...r14Stmts,
    ]);

    const tagNames = resolvedTags.map((t) => t.name);
    const outEntry = buildEntryView({
      id: outRow.id,
      wallet: fromWallet,
      type: 'transfer_out',
      amount: input.amountSent,
      categoryId: null,
      transferId: target.transferId,
      counterpartWalletId: toWallet.id,
      date: input.date,
      time: input.time ?? null,
      note: input.note ?? null,
      tags: tagNames,
      excludeFromReports: Boolean(input.excludeFromReports),
      createdAt: outRow.createdAt,
    });
    const inEntry = buildEntryView({
      id: inRow.id,
      wallet: toWallet,
      type: 'transfer_in',
      amount: amountReceived,
      categoryId: null,
      transferId: target.transferId,
      counterpartWalletId: fromWallet.id,
      date: input.date,
      time: input.time ?? null,
      note: input.note ?? null,
      tags: tagNames,
      excludeFromReports: Boolean(input.excludeFromReports),
      createdAt: inRow.createdAt,
    });

    return c.json({ entries: [outEntry, inEntry] }, 200);
  });

  app.delete('/me/personal/transactions/:id', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const id = c.req.param('id');
    const db = getDb(c.env);

    const rows = await db
      .select({
        id: personalTransactions.id,
        walletId: personalTransactions.walletId,
        type: personalTransactions.type,
        amount: personalTransactions.amount,
        categoryId: personalTransactions.categoryId,
        assetId: personalTransactions.assetId,
        quantity: personalTransactions.quantity,
        transferId: personalTransactions.transferId,
        date: personalTransactions.date,
        time: personalTransactions.time,
        note: personalTransactions.note,
        excludeFromReports: personalTransactions.excludeFromReports,
        createdAt: personalTransactions.createdAt,
        currency: personalWallets.currency,
        startDate: personalWallets.startDate,
        kind: personalWalletSettings.kind,
      })
      .from(personalTransactions)
      .innerJoin(personalWallets, eq(personalWallets.id, personalTransactions.walletId))
      .leftJoin(personalWalletSettings, eq(personalWalletSettings.walletId, personalWallets.id))
      .where(
        and(
          eq(personalTransactions.userId, user.id),
          or(
            eq(personalTransactions.id, id),
            sql`${personalTransactions.transferId} IS NOT NULL AND ${personalTransactions.transferId} = (SELECT ${personalTransactions.transferId} FROM ${personalTransactions} WHERE ${personalTransactions.id} = ${id} AND ${personalTransactions.userId} = ${user.id})`,
          ),
        ),
      )
      .all();

    if (rows.length === 0) {
      throw new ApiError('NOT_FOUND', 404, 'Transaction not found');
    }

    const sortedRows = [...rows].sort((a, b) => {
      if (a.type === 'transfer_out' && b.type === 'transfer_in') return -1;
      if (a.type === 'transfer_in' && b.type === 'transfer_out') return 1;
      return 0;
    });

    const txIds = sortedRows.map((r) => r.id);
    const deletedIds = new Set(txIds);

    for (const r of sortedRows) {
      if (r.type === 'buy') {
        const existingTrades = await loadWalletTrades(db, user.id, r.walletId);
        assertNoOversell(
          {
            id: r.walletId,
            currency: r.currency as CurrencyCode,
            startAmount: 0,
            startDate: r.startDate,
            startCostVnd: null,
            archived: false,
          },
          existingTrades.filter((t) => !deletedIds.has(t.id)),
        );
      }
    }

    const tagRows = await db
      .select({
        transactionId: personalTransactionTags.transactionId,
        name: personalTags.name,
      })
      .from(personalTransactionTags)
      .innerJoin(personalTags, eq(personalTags.id, personalTransactionTags.tagId))
      .where(inArray(personalTransactionTags.transactionId, txIds))
      .orderBy(sql`${personalTransactionTags}.rowid asc`)
      .all();

    const tagsByTx = new Map<string, string[]>();
    for (const tr of tagRows) {
      const list = tagsByTx.get(tr.transactionId) ?? [];
      list.push(tr.name);
      tagsByTx.set(tr.transactionId, list);
    }

    const now = nowIso();
    const deleteTouchesNonVndTransfer =
      sortedRows.some((r) => r.type === 'transfer_out' || r.type === 'transfer_in') &&
      sortedRows.some((r) => r.currency !== 'VND');

    await commitPersonalWrite(db, user.id, () => [
      recordDeletions(db, user.id, inArray(personalTransactions.id, txIds)),
      db
        .delete(personalTransactionTags)
        .where(inArray(personalTransactionTags.transactionId, txIds)),
      db
        .delete(personalTransactions)
        .where(
          and(
            eq(personalTransactions.userId, user.id),
            inArray(personalTransactions.id, txIds),
          ),
        ),
      ...walletBalanceDeltaStmts(
        db,
        user.id,
        sortedRows.map((r) => ({
          walletId: r.walletId,
          netDelta: -signedPersonalAmount(r.type as PersonalEntryType, r.amount),
          countDelta: -1,
          needsReplay:
            r.type === 'buy' ||
            r.type === 'sell' ||
            walletNeedsReplay({
              currency: r.currency as CurrencyCode,
              kind: (r.kind ?? 'everyday') as WalletKind,
            }),
        })),
        now,
      ),
      ...assetCountDeltaStmts(
        db,
        user.id,
        sortedRows
          .filter((r) => r.assetId)
          .map((r) => ({ assetId: r.assetId!, delta: -1 })),
      ),
      ...(deleteTouchesNonVndTransfer
        ? [markAllNonVndOrInvestmentReplayStmt(db, user.id, now)]
        : []),
    ]);

    const entries: EntryView[] = sortedRows.map((r) => {
      const other =
        sortedRows.length === 2 ? sortedRows.find((o) => o.id !== r.id) ?? null : null;
      return buildEntryView({
        id: r.id,
        wallet: {
          id: r.walletId,
          currency: r.currency as CurrencyCode,
          kind: 'everyday',
          startAmount: 0,
          startDate: r.startDate,
          startCostVnd: null,
          archived: false,
        },
        type: r.type as PersonalEntryType,
        amount: r.amount,
        categoryId: r.categoryId ?? null,
        assetId: r.assetId ?? null,
        quantity: r.quantity ?? null,
        transferId: r.transferId ?? null,
        counterpartWalletId: other ? other.walletId : null,
        date: r.date,
        time: r.time ?? null,
        note: r.note ?? null,
        tags: tagsByTx.get(r.id) ?? [],
        excludeFromReports: Boolean(r.excludeFromReports),
        createdAt: r.createdAt,
      });
    });

    return c.json({ entries }, 200);
  });

  app.post('/me/personal/transactions/restore', requirePersonal, async (c) => {
    const user = (await getSessionUser(c))!;
    const rawBody = await parseJson<Record<string, unknown>>(c);

    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    if (
      !Array.isArray(rawBody.entries) ||
      rawBody.entries.length < 1 ||
      rawBody.entries.length > 2
    ) {
      throw new ApiError('VALIDATION', 422, 'Invalid entries');
    }

    const now = nowIso();
    const items = rawBody.entries.map((item) => parseRestoreItem(item));

    if (items.length === 1) {
      const item = items[0]!;
      if (
        item.type !== 'expense' &&
        item.type !== 'income' &&
        item.type !== 'buy' &&
        item.type !== 'sell'
      ) {
        throw new ApiError('VALIDATION', 422, 'Single restored entry must be expense, income, buy or sell');
      }
    } else {
      const [outItem, inItem] = items as [ParsedRestoreItem, ParsedRestoreItem];
      if (outItem.type !== 'transfer_out' || inItem.type !== 'transfer_in') {
        throw new ApiError('VALIDATION', 422, 'Two restored entries must be a transfer pair');
      }
      if (
        !outItem.transferId ||
        outItem.transferId !== inItem.transferId ||
        outItem.id === inItem.id ||
        outItem.walletId === inItem.walletId ||
        outItem.date !== inItem.date ||
        outItem.time !== inItem.time ||
        outItem.note !== inItem.note ||
        outItem.excludeFromReports !== inItem.excludeFromReports ||
        outItem.createdAt !== inItem.createdAt ||
        !sameTagSet(outItem.tags, inItem.tags)
      ) {
        throw new ApiError('VALIDATION', 422, 'Invalid transfer pair');
      }
    }

    const db = getDb(c.env);
    const itemIds = items.map((i) => i.id);
    const transferId = items.length === 2 ? items[0]!.transferId : null;

    const existingRows = await db
      .select({
        id: personalTransactions.id,
        userId: personalTransactions.userId,
      })
      .from(personalTransactions)
      .where(
        transferId
          ? or(
              inArray(personalTransactions.id, itemIds),
              and(
                eq(personalTransactions.userId, user.id),
                eq(personalTransactions.transferId, transferId),
              ),
            )
          : inArray(personalTransactions.id, itemIds),
      )
      .all();

    if (existingRows.some((r) => r.userId !== user.id)) {
      throw new ApiError('NOT_FOUND', 404, 'Transaction not found');
    }
    if (existingRows.length > 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Transaction already exists.');
    }

    const wallets = await loadWalletsMap(
      db,
      user.id,
      items.map((i) => i.walletId),
    );

    if (items.length === 1) {
      const item = items[0]!;
      const wallet = wallets.get(item.walletId)!;
      if (!isValidAmount(item.amount, wallet.currency)) {
        throw new ApiError('VALIDATION', 422, 'Invalid amount');
      }
      if (item.type === 'buy' || item.type === 'sell') {
        if (wallet.kind !== 'investment') {
          throw new ApiError('VALIDATION', 422, 'Wallet must be an investment wallet');
        }
        await requireAsset(db, user.id, item.assetId!, true);
        const existingTrades = await loadWalletTrades(db, user.id, wallet.id);
        assertNoOversell(wallet, [
          ...existingTrades,
          {
            id: item.id,
            walletId: item.walletId,
            type: item.type,
            amount: item.amount,
            date: item.date,
            time: item.time,
            createdAt: item.createdAt,
            transferId: null,
            excludeFromReports: false,
            assetId: item.assetId,
            quantity: item.quantity,
          },
        ]);
      } else {
        await requireCategory(db, user.id, item.categoryId!, item.type as 'expense' | 'income', true);
      }
    } else {
      const [outItem, inItem] = items as [ParsedRestoreItem, ParsedRestoreItem];
      const fromWallet = wallets.get(outItem.walletId)!;
      const toWallet = wallets.get(inItem.walletId)!;
      resolveTransferAmounts(
        outItem.amount,
        inItem.amount,
        fromWallet.currency,
        toWallet.currency,
      );
    }

    // Collect all unique tag names across items
    const allTagNames: string[] = [];
    const seenLower = new Set<string>();
    for (const item of items) {
      for (const t of item.tags) {
        const lower = t.toLowerCase();
        if (!seenLower.has(lower)) {
          seenLower.add(lower);
          allTagNames.push(t);
        }
      }
    }

    const resolvedAll = await resolveTags(db, user.id, allTagNames, now);
    const resolvedByLower = new Map(resolvedAll.map((t) => [t.name.toLowerCase(), t]));

    const restoredIds = items.map((i) => i.id);
    const restoreTouchesNonVndTransfer =
      items.length === 2 &&
      items.some((item) => wallets.get(item.walletId)!.currency !== 'VND');

    try {
      await commitPersonalWrite(db, user.id, (v) => [
        clearDeletions(db, user.id, restoredIds),
        ...items.flatMap((item) => [
          db.insert(personalTransactions).values({
            id: item.id,
            userId: user.id,
            walletId: item.walletId,
            type: item.type,
            amount: item.amount,
            categoryId: item.categoryId,
            assetId: item.assetId,
            quantity: item.quantity,
            transferId: item.transferId,
            date: item.date,
            time: item.time,
            note: item.note,
            excludeFromReports: item.excludeFromReports ? 1 : 0,
            source: 'manual',
            createdAt: item.createdAt,
            updatedAt: now,
            syncVersion: v,
          }),
          ...item.tags.map((rawTag) => {
            const tag = resolvedByLower.get(rawTag.toLowerCase())!;
            return db.insert(personalTransactionTags).values({
              transactionId: item.id,
              tagId: tag.id,
            });
          }),
        ]),
        ...walletBalanceDeltaStmts(
          db,
          user.id,
          items.map((item) => {
            const w = wallets.get(item.walletId)!;
            return {
              walletId: item.walletId,
              netDelta: signedPersonalAmount(item.type, item.amount),
              countDelta: 1,
              needsReplay:
                item.type === 'buy' || item.type === 'sell' || walletNeedsReplay(w),
            };
          }),
          now,
        ),
        ...assetCountDeltaStmts(
          db,
          user.id,
          items
            .filter((item) => item.assetId)
            .map((item) => ({ assetId: item.assetId!, delta: 1 })),
        ),
        ...(restoreTouchesNonVndTransfer
          ? [markAllNonVndOrInvestmentReplayStmt(db, user.id, now)]
          : []),
      ]);
    } catch (err) {
      if (isDbError(err, 'UNIQUE constraint failed') || isDbError(err, 'UNIQUE')) {
        throw new ApiError('ALREADY_HANDLED', 409, 'Transaction already exists.');
      }
      throw err;
    }

    const entries: EntryView[] = items.map((item) => {
      const other = items.length === 2 ? items.find((o) => o.id !== item.id) ?? null : null;
      const wallet = wallets.get(item.walletId)!;
      const canonicalTags = item.tags.map((t) => resolvedByLower.get(t.toLowerCase())!.name);
      return buildEntryView({
        id: item.id,
        wallet,
        type: item.type,
        amount: item.amount,
        categoryId: item.categoryId,
        assetId: item.assetId,
        quantity: item.quantity,
        transferId: item.transferId,
        counterpartWalletId: other ? other.walletId : null,
        date: item.date,
        time: item.time,
        note: item.note,
        tags: canonicalTags,
        excludeFromReports: item.excludeFromReports,
        createdAt: item.createdAt,
      });
    });

    return c.json({ entries }, 200);
  });

  return app;
}
