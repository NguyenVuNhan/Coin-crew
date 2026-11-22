import { useMemo } from 'react';
import {
  guessExpenseCategory,
  type GroupListQuery,
  type GuessEntry,
  type GuessPersonRow,
} from '@cc/core';
import { useCopyGroupRows } from '@cc/web-data-access/txCopy/groupCopy';
import { useTxCopy } from '@cc/web-data-access/txCopy/hooks';

const ALL_GROUP_ROWS_QUERY: GroupListQuery = {
  from: '1970-01-01',
  to: '9999-12-31',
  groups: 'show',
};

export interface UseCategoryGuessArgs {
  personNames: string[];
  amount: number | null;
  enabled: boolean;
}

/**
 * Guesses an expense category on-device from the local transaction and group-row copies.
 * Returns `null` when disabled, when no local copy is ready, or when there is not enough support.
 */
export function useCategoryGuess({
  personNames,
  amount,
  enabled,
}: UseCategoryGuessArgs): string | null {
  const { status: txStatus, snapshot: txSnapshot } = useTxCopy();
  const { groupRows, ready: groupReady } = useCopyGroupRows(ALL_GROUP_ROWS_QUERY, { enabled });

  const personNamesKey = personNames.join('\0');

  return useMemo(() => {
    if (!enabled) return null;

    const hasAmount = amount !== null && amount > 0;
    const hasPeople = personNames.length > 0;
    if (!hasAmount && !hasPeople) return null;

    const entries: GuessEntry[] =
      hasAmount && txStatus === 'ready' && txSnapshot ? txSnapshot.entries : [];

    const personRows: GuessPersonRow[] =
      hasPeople && groupReady && groupRows
        ? groupRows.map((row) => {
            const names = new Set<string>(row.people);
            if (row.counterpartName) names.add(row.counterpartName);
            if (row.payerName) names.add(row.payerName);
            return {
              personNames: [...names],
              categoryId: row.link?.categoryId ?? null,
              activityAt: row.activityAt,
            };
          })
        : [];

    if (entries.length === 0 && personRows.length === 0) return null;

    return guessExpenseCategory({
      entries,
      personRows,
      personNames,
      amount: amount ?? 0,
      now: new Date(),
    });
  }, [enabled, txStatus, txSnapshot, groupReady, groupRows, personNamesKey, amount]);
}
