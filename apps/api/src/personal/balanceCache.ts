import { and, eq, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '@cc/api-db/client';
import {
  personalAssetCounts,
  personalWalletBalances,
  personalWallets,
  personalWalletSettings,
} from '@cc/api-db/schema';
import type { PersonalEntryType } from '@cc/core';

export interface WalletBalanceDelta {
  walletId: string;
  netDelta: number;
  countDelta: number;
  needsReplay?: boolean;
}

export interface AssetCountDelta {
  assetId: string;
  delta: number;
}

export function signedPersonalAmount(type: PersonalEntryType, amount: number): number {
  return type === 'income' || type === 'transfer_in' || type === 'sell' ? amount : -amount;
}

export function initWalletBalanceStmt(
  db: Db,
  userId: string,
  walletId: string,
  now: string,
  initialVnd?: { vndValue?: number | null; cashVnd?: number | null },
): BatchItem<'sqlite'> {
  return db
    .insert(personalWalletBalances)
    .values({
      walletId,
      userId,
      personalNet: 0,
      entryCount: 0,
      vndValue: initialVnd?.vndValue ?? null,
      cashVnd: initialVnd?.cashVnd ?? null,
      holdingsJson: null,
      needsReplay: 0,
      updatedAt: now,
    })
    .onConflictDoNothing() as unknown as BatchItem<'sqlite'>;
}

export function walletBalanceDeltaStmts(
  db: Db,
  userId: string,
  deltas: WalletBalanceDelta[],
  now: string,
): BatchItem<'sqlite'>[] {
  // Triggers maintain personal_net and entry_count on personal_transactions writes;
  // only emit needs_replay updates when a caller flags a wallet for replay.
  const replayWalletIds = new Set<string>();
  for (const d of deltas) {
    if (d.needsReplay) {
      replayWalletIds.add(d.walletId);
    }
  }

  const stmts: BatchItem<'sqlite'>[] = [];
  for (const walletId of replayWalletIds) {
    stmts.push(
      db
        .update(personalWalletBalances)
        .set({
          needsReplay: 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(personalWalletBalances.walletId, walletId),
            eq(personalWalletBalances.userId, userId),
          ),
        ) as unknown as BatchItem<'sqlite'>,
    );
  }
  return stmts;
}

export function markAllNonVndOrInvestmentReplayStmt(
  db: Db,
  userId: string,
  now: string,
): BatchItem<'sqlite'> {
  return db
    .update(personalWalletBalances)
    .set({
      needsReplay: 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(personalWalletBalances.userId, userId),
        sql`${personalWalletBalances.walletId} IN (
          SELECT ${personalWallets.id}
          FROM ${personalWallets}
          LEFT JOIN ${personalWalletSettings} ON ${personalWalletSettings.walletId} = ${personalWallets.id}
          WHERE ${personalWallets.userId} = ${userId}
            AND (${personalWallets.currency} <> 'VND' OR COALESCE(${personalWalletSettings.kind}, 'everyday') = 'investment')
        )`,
      ),
    ) as unknown as BatchItem<'sqlite'>;
}

export function assetCountDeltaStmts(
  db: Db,
  userId: string,
  deltas: AssetCountDelta[],
): BatchItem<'sqlite'>[] {
  const byAsset = new Map<string, number>();
  for (const d of deltas) {
    byAsset.set(d.assetId, (byAsset.get(d.assetId) ?? 0) + d.delta);
  }

  const stmts: BatchItem<'sqlite'>[] = [];
  for (const [assetId, delta] of byAsset.entries()) {
    if (delta === 0) continue;
    stmts.push(
      db
        .insert(personalAssetCounts)
        .values({
          assetId,
          userId,
          entryCount: Math.max(0, delta),
        })
        .onConflictDoUpdate({
          target: personalAssetCounts.assetId,
          set: {
            entryCount: sql`MAX(0, ${personalAssetCounts.entryCount} + ${delta})`,
          },
        }) as unknown as BatchItem<'sqlite'>,
    );
  }
  return stmts;
}
