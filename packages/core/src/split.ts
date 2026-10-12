import { MAX_AMOUNT } from './money';

export type SplitMode = 'equal' | 'amounts' | 'percent' | 'shares' | 'adjust';
export interface SplitEntry { participantId: string; value: number }
export type SplitError = 'NO_PARTICIPANTS' | 'INVALID_AMOUNT' | 'AMOUNTS_DONT_ADD_UP' | 'PERCENT_NOT_100' | 'SHARES_NOT_POSITIVE' | 'NEGATIVE_SHARE';
export type SplitResult = { ok: true; shares: { participantId: string; amount: number }[] } | { ok: false; error: SplitError };

function distributeWeighted(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (total === 0) {
    return new Array(n).fill(0);
  }

  const bigTotal = BigInt(total);
  const sumWeights = weights.reduce((acc, w) => acc + BigInt(w), 0n);

  const floorShares: number[] = new Array(n);
  const remainders: bigint[] = new Array(n);

  let allocated = 0;
  for (let i = 0; i < n; i++) {
    const w = BigInt(weights[i]!);
    const prod = bigTotal * w;
    const share = Number(prod / sumWeights);
    const rem = prod % sumWeights;
    floorShares[i] = share;
    remainders[i] = rem;
    allocated += share;
  }

  let leftover = total - allocated;
  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((a, b) => {
    const remA = remainders[a]!;
    const remB = remainders[b]!;
    if (remA > remB) return -1;
    if (remA < remB) return 1;
    return a - b;
  });

  for (let i = 0; i < leftover; i++) {
    const idx = indices[i % n]!;
    floorShares[idx] = floorShares[idx]! + 1;
  }

  return floorShares;
}

export function computeShares(total: number, mode: SplitMode, entries: SplitEntry[]): SplitResult {
  if (!Number.isSafeInteger(total) || total < 1 || total > MAX_AMOUNT) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }

  if (entries.length === 0) {
    return { ok: false, error: 'NO_PARTICIPANTS' };
  }

  const n = entries.length;

  switch (mode) {
    case 'equal': {
      const weights = new Array(n).fill(1);
      const amounts = distributeWeighted(total, weights);
      return {
        ok: true,
        shares: entries.map((e, i) => ({ participantId: e.participantId, amount: amounts[i]! })),
      };
    }

    case 'amounts': {
      let sum = 0;
      for (const entry of entries) {
        if (!Number.isSafeInteger(entry.value) || entry.value < 0) {
          return { ok: false, error: 'AMOUNTS_DONT_ADD_UP' };
        }
        sum += entry.value;
      }
      if (sum !== total) {
        return { ok: false, error: 'AMOUNTS_DONT_ADD_UP' };
      }
      return {
        ok: true,
        shares: entries.map((e) => ({ participantId: e.participantId, amount: e.value })),
      };
    }

    case 'percent': {
      let sum = 0;
      const weights: number[] = [];
      for (const entry of entries) {
        if (!Number.isSafeInteger(entry.value) || entry.value < 0) {
          return { ok: false, error: 'PERCENT_NOT_100' };
        }
        sum += entry.value;
        weights.push(entry.value);
      }
      if (sum !== 10000) {
        return { ok: false, error: 'PERCENT_NOT_100' };
      }
      const amounts = distributeWeighted(total, weights);
      return {
        ok: true,
        shares: entries.map((e, i) => ({ participantId: e.participantId, amount: amounts[i]! })),
      };
    }

    case 'shares': {
      const weights: number[] = [];
      for (const entry of entries) {
        if (!Number.isSafeInteger(entry.value) || entry.value <= 0) {
          return { ok: false, error: 'SHARES_NOT_POSITIVE' };
        }
        weights.push(entry.value);
      }
      const amounts = distributeWeighted(total, weights);
      return {
        ok: true,
        shares: entries.map((e, i) => ({ participantId: e.participantId, amount: amounts[i]! })),
      };
    }

    case 'adjust': {
      let sumAdjustments = 0;
      for (const entry of entries) {
        if (!Number.isSafeInteger(entry.value)) {
          return { ok: false, error: 'NEGATIVE_SHARE' };
        }
        sumAdjustments += entry.value;
      }
      const pool = total - sumAdjustments;
      if (pool < 0) {
        return { ok: false, error: 'NEGATIVE_SHARE' };
      }

      const equalPoolAmounts = distributeWeighted(pool, new Array(n).fill(1));
      const shares: { participantId: string; amount: number }[] = [];

      for (let i = 0; i < n; i++) {
        const participantShare = equalPoolAmounts[i]! + entries[i]!.value;
        if (participantShare < 0) {
          return { ok: false, error: 'NEGATIVE_SHARE' };
        }
        shares.push({ participantId: entries[i]!.participantId, amount: participantShare });
      }

      return {
        ok: true,
        shares,
      };
    }
  }
}
