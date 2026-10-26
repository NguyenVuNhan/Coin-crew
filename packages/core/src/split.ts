import { MAX_AMOUNT } from './money';

export type SplitMode = 'equal' | 'amounts' | 'percent' | 'shares' | 'adjust';
/** `value: null` is a blank box: in exact amounts and percent it shares what the typed entries leave. */
export interface SplitEntry { participantId: string; value: number | null }
export type SplitError = 'NO_PARTICIPANTS' | 'INVALID_AMOUNT' | 'AMOUNTS_DONT_ADD_UP' | 'PERCENT_NOT_100' | 'SHARES_NOT_POSITIVE' | 'NEGATIVE_SHARE' | 'INVALID_VALUE';
export type SplitResult = { ok: true; shares: { participantId: string; amount: number }[] } | { ok: false; error: SplitError };

export type Gender = 'M' | 'F';
export type SportRule =
  | { kind: 'equal' }
  | { kind: 'discount'; femaleDiscount: number }
  | { kind: 'ratio'; maleWeight: number; femaleWeight: number };

export interface SportParticipantEntry {
  participantId: string;
  maleSlots: number;
  femaleSlots: number;
  fixedAmount?: number | null;
}

export interface SportSplitOutput {
  shares: { participantId: string; amount: number }[];
  maleSlotRate: number;
  femaleSlotRate: number;
  totalMaleSlots: number;
  totalFemaleSlots: number;
}

export type SportSplitResult =
  | ({ ok: true } & SportSplitOutput)
  | { ok: false; error: SplitError };

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
  const autoCount = entries.filter((e) => e.value === null).length;
  if (autoCount > 0 && mode !== 'amounts' && mode !== 'percent') {
    return { ok: false, error: 'INVALID_VALUE' };
  }

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
        if (entry.value === null) continue;
        if (!Number.isSafeInteger(entry.value) || entry.value < 0) {
          return { ok: false, error: 'AMOUNTS_DONT_ADD_UP' };
        }
        sum += entry.value;
      }
      if (sum > total || (autoCount === 0 && sum !== total)) {
        return { ok: false, error: 'AMOUNTS_DONT_ADD_UP' };
      }
      // The blank boxes split what is left equally, the few leftover dong going to the earliest.
      const autoAmounts = distributeWeighted(total - sum, new Array(autoCount).fill(1));
      let autoIdx = 0;
      return {
        ok: true,
        shares: entries.map((e) => ({ participantId: e.participantId, amount: e.value ?? autoAmounts[autoIdx++]! })),
      };
    }

    case 'percent': {
      let sum = 0;
      for (const entry of entries) {
        if (entry.value === null) continue;
        if (!Number.isSafeInteger(entry.value) || entry.value < 0) {
          return { ok: false, error: 'PERCENT_NOT_100' };
        }
        sum += entry.value;
      }
      if (sum > 10000 || (autoCount === 0 && sum !== 10000)) {
        return { ok: false, error: 'PERCENT_NOT_100' };
      }
      // Scaled by the number of blank boxes so each blank weighs (100% − typed) / k without fractions: the weights
      // total 10000 × k, typed people get exactly their percent and the blanks split the rest of the money.
      const k = Math.max(autoCount, 1);
      const weights = entries.map((e) => (e.value === null ? 10000 - sum : e.value * k));
      const amounts = distributeWeighted(total, weights);
      return {
        ok: true,
        shares: entries.map((e, i) => ({ participantId: e.participantId, amount: amounts[i]! })),
      };
    }

    case 'shares': {
      const weights: number[] = [];
      for (const entry of entries) {
        if (!Number.isSafeInteger(entry.value) || entry.value! <= 0) {
          return { ok: false, error: 'SHARES_NOT_POSITIVE' };
        }
        weights.push(entry.value!);
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
        sumAdjustments += entry.value!;
      }
      const pool = total - sumAdjustments;
      if (pool < 0) {
        return { ok: false, error: 'NEGATIVE_SHARE' };
      }

      const equalPoolAmounts = distributeWeighted(pool, new Array(n).fill(1));
      const shares: { participantId: string; amount: number }[] = [];

      for (let i = 0; i < n; i++) {
        const participantShare = equalPoolAmounts[i]! + entries[i]!.value!;
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

export function computeSportShares(
  total: number,
  rule: SportRule,
  entries: SportParticipantEntry[],
): SportSplitResult {
  if (!Number.isSafeInteger(total) || total < 1 || total > MAX_AMOUNT) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, error: 'NO_PARTICIPANTS' };
  }

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'INVALID_VALUE' };
    }
    if (
      !Number.isSafeInteger(entry.maleSlots) ||
      entry.maleSlots < 0 ||
      !Number.isSafeInteger(entry.femaleSlots) ||
      entry.femaleSlots < 0
    ) {
      return { ok: false, error: 'INVALID_VALUE' };
    }
    if (entry.fixedAmount !== undefined && entry.fixedAmount !== null) {
      if (typeof entry.fixedAmount === 'number' && entry.fixedAmount < 0) {
        return { ok: false, error: 'NEGATIVE_SHARE' };
      }
      if (!Number.isSafeInteger(entry.fixedAmount)) {
        return { ok: false, error: 'INVALID_VALUE' };
      }
    }
  }

  const activeEntries = entries.filter(
    (e) => (e.fixedAmount !== undefined && e.fixedAmount !== null) || e.maleSlots + e.femaleSlots > 0,
  );

  if (activeEntries.length === 0) {
    return { ok: false, error: 'NO_PARTICIPANTS' };
  }

  const fixedEntries = activeEntries.filter((e) => e.fixedAmount !== undefined && e.fixedAmount !== null);
  const poolEntries = activeEntries.filter(
    (e) => (e.fixedAmount === undefined || e.fixedAmount === null) && e.maleSlots + e.femaleSlots > 0,
  );

  const fixedSum = fixedEntries.reduce((sum, e) => sum + e.fixedAmount!, 0);
  if (fixedSum > total) {
    return { ok: false, error: 'AMOUNTS_DONT_ADD_UP' };
  }

  const pool = total - fixedSum;

  if (poolEntries.length === 0) {
    if (pool !== 0) {
      return { ok: false, error: 'AMOUNTS_DONT_ADD_UP' };
    }
    return {
      ok: true,
      shares: activeEntries.map((e) => ({ participantId: e.participantId, amount: e.fixedAmount! })),
      maleSlotRate: 0,
      femaleSlotRate: 0,
      totalMaleSlots: 0,
      totalFemaleSlots: 0,
    };
  }

  const M = poolEntries.reduce((sum, e) => sum + e.maleSlots, 0);
  const F = poolEntries.reduce((sum, e) => sum + e.femaleSlots, 0);
  const S = M + F;

  let poolAmounts: number[];
  let maleSlotRate = 0;
  let femaleSlotRate = 0;

  if (rule.kind === 'equal' || (rule.kind === 'discount' && (rule.femaleDiscount === 0 || M === 0 || F === 0))) {
    if (rule.kind === 'discount') {
      if (!Number.isSafeInteger(rule.femaleDiscount) || rule.femaleDiscount < 0) {
        return { ok: false, error: 'INVALID_VALUE' };
      }
    }
    const weights = poolEntries.map((e) => e.maleSlots + e.femaleSlots);
    poolAmounts = distributeWeighted(pool, weights);
    maleSlotRate = M > 0 ? Math.round(pool / S) : 0;
    femaleSlotRate = F > 0 ? Math.round(pool / S) : 0;
  } else if (rule.kind === 'discount') {
    if (!Number.isSafeInteger(rule.femaleDiscount) || rule.femaleDiscount < 0) {
      return { ok: false, error: 'INVALID_VALUE' };
    }
    const basePool = pool - rule.femaleDiscount * M;
    if (basePool < 0) {
      return { ok: false, error: 'NEGATIVE_SHARE' };
    }
    const weights = poolEntries.map((e) => e.maleSlots + e.femaleSlots);
    const baseAmounts = distributeWeighted(basePool, weights);
    poolAmounts = baseAmounts.map((amt, idx) => amt + rule.femaleDiscount * poolEntries[idx]!.maleSlots);
    femaleSlotRate = Math.round(basePool / S);
    maleSlotRate = femaleSlotRate + rule.femaleDiscount;
  } else if (rule.kind === 'ratio') {
    if (
      !Number.isSafeInteger(rule.maleWeight) ||
      rule.maleWeight <= 0 ||
      !Number.isSafeInteger(rule.femaleWeight) ||
      rule.femaleWeight <= 0
    ) {
      return { ok: false, error: 'INVALID_VALUE' };
    }
    const weights = poolEntries.map((e) => e.maleSlots * rule.maleWeight + e.femaleSlots * rule.femaleWeight);
    poolAmounts = distributeWeighted(pool, weights);
    const W = M * rule.maleWeight + F * rule.femaleWeight;
    maleSlotRate = M > 0 ? Math.round((pool * rule.maleWeight) / W) : 0;
    femaleSlotRate = F > 0 ? Math.round((pool * rule.femaleWeight) / W) : 0;
  } else {
    return { ok: false, error: 'INVALID_VALUE' };
  }

  let poolIdx = 0;
  const shares = activeEntries.map((e) => {
    if (e.fixedAmount !== undefined && e.fixedAmount !== null) {
      return { participantId: e.participantId, amount: e.fixedAmount };
    }
    const amount = poolAmounts[poolIdx++]!;
    return { participantId: e.participantId, amount };
  });

  return {
    ok: true,
    shares,
    maleSlotRate,
    femaleSlotRate,
    totalMaleSlots: M,
    totalFemaleSlots: F,
  };
}

