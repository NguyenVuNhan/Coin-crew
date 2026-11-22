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
  const byWallet = new Map<
    string,
    { walletId: string; netDelta: number; countDelta: number; needsReplay: boolean }
  >();
  for (const d of deltas) {
    const existing = byWallet.get(d.walletId);
    if (existing) {
      existing.netDelta += d.netDelta;
      existing.countDelta += d.countDelta;
      existing.needsReplay = existing.needsReplay || Boolean(d.needsReplay);
    } else {
      byWallet.set(d.walletId, {
        walletId: d.walletId,
        netDelta: d.netDelta,
        countDelta: d.countDelta,
        needsReplay: Boolean(d.needsReplay),
      });
    }
  }

  const stmts: BatchItem<'sqlite'>[] = [];
  for (const d of byWallet.values()) {
    if (d.netDelta === 0 && d.countDelta === 0 && !d.needsReplay) {
      continue;
    }
    stmts.push(
      db
        .insert(personalWalletBalances)
        .values({
          walletId: d.walletId,
          userId,
          personalNet: d.netDelta,
          entryCount: d.countDelta,
          vndValue: null,
          cashVnd: null,
          holdingsJson: null,
          needsReplay: d.needsReplay ? 1 : 0,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: personalWalletBalances.walletId,
          set: {
            personalNet: sql`${personalWalletBalances.personalNet} + ${d.netDelta}`,
            entryCount: sql`${personalWalletBalances.entryCount} + ${d.countDelta}`,
            needsReplay: d.needsReplay
              ? 1
              : sql`${personalWalletBalances.needsReplay}`,
            updatedAt: now,
          },
        }) as unknown as BatchItem<'sqlite'>,
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
