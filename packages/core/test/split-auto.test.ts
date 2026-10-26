import { describe, it, expect } from 'vitest';
import { computeShares, type SplitResult } from '../src/split';

// Blank boxes reach core as `value: null`; the shared helper in split.test.ts would turn them into 1.
const ea = (ids: string[], values: (number | null)[]) => ids.map((participantId, i) => ({ participantId, value: values[i] as number | null }));
const amounts = (r: SplitResult) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.shares.map((s) => s.amount);
};
const ids4 = ['m', 'a', 'b', 'c'];

describe('computeShares with automatic entries', () => {
  it('exact: blanks share what is left', () => expect(amounts(computeShares(1_000_000, 'amounts', ea(ids4, [400000, null, null, null])))).toEqual([400000, 200000, 200000, 200000]));
  it('exact: blanks are at most 1₫ apart', () => expect(amounts(computeShares(100_000, 'amounts', ea(ids4, [50000, null, null, null])))).toEqual([50000, 16667, 16667, 16666]));
  it('exact: nothing left gives blanks 0', () => expect(amounts(computeShares(100_000, 'amounts', ea(['m', 'a', 'b'], [100000, null, null])))).toEqual([100000, 0, 0]));
  it('exact: typed over the total is refused', () => expect(computeShares(100_000, 'amounts', ea(['m', 'a'], [120000, null]))).toEqual({ ok: false, error: 'AMOUNTS_DONT_ADD_UP' }));
  it('exact: all blank splits equally', () => expect(amounts(computeShares(100_000, 'amounts', ea(['m', 'a', 'b'], [null, null, null])))).toEqual([33334, 33333, 33333]));
  it('exact: one blank takes the rest', () => expect(amounts(computeShares(100_000, 'amounts', ea(['m', 'a'], [30000, null])))).toEqual([30000, 70000]));
  it('exact: a typed 0 stays on at 0', () => {
    const r = computeShares(100_000, 'amounts', ea(['m', 'a'], [0, null]));
    expect(r.ok && r.shares).toEqual([{ participantId: 'm', amount: 0 }, { participantId: 'a', amount: 100000 }]);
  });

  it('percent: 40% and three blanks', () => expect(amounts(computeShares(1_000_000, 'percent', ea(ids4, [4000, null, null, null])))).toEqual([400000, 200000, 200000, 200000]));
  it('percent: all blank', () => expect(amounts(computeShares(100_000, 'percent', ea(['m', 'a', 'b'], [null, null, null])))).toEqual([33334, 33333, 33333]));
  it('percent: 33.33% typed', () => expect(amounts(computeShares(100_000, 'percent', ea(['m', 'a', 'b'], [3333, null, null])))).toEqual([33330, 33335, 33335]));
  it('percent: 100% typed leaves blanks at 0', () => expect(amounts(computeShares(100_000, 'percent', ea(ids4, [6000, 4000, null, null])))).toEqual([60000, 40000, 0, 0]));
  it('percent: over 100% is refused', () => expect(computeShares(100_000, 'percent', ea(['m', 'a', 'b'], [6000, 5000, null]))).toEqual({ ok: false, error: 'PERCENT_NOT_100' }));
  it('percent: no blanks still needs 100%', () => expect(computeShares(100_000, 'percent', ea(['m', 'a'], [6000, 3000]))).toEqual({ ok: false, error: 'PERCENT_NOT_100' }));

  it.each([['equal', 1], ['shares', 100], ['adjust', 0]] as const)('a blank is refused in %s', (mode, v) =>
    expect(computeShares(100_000, mode, ea(['m', 'a'], [null, v]))).toEqual({ ok: false, error: 'INVALID_VALUE' }));

  it('blanks always add up to the total (200 seeded cases)', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 200; i++) {
      const mode = i % 2 === 0 ? 'amounts' : 'percent';
      const n = 1 + Math.floor(rnd() * 7);
      const total = 1 + Math.floor(rnd() * 50_000_000);
      const cap = mode === 'amounts' ? Math.floor(total / (2 * n)) : Math.floor(10000 / (2 * n));
      const values = Array.from({ length: n }, (_, k) => (k === 0 || rnd() < 0.5 ? null : Math.floor(rnd() * cap)));
      const r = computeShares(total, mode, ea(Array.from({ length: n }, (_, k) => `p${k}`), values));
      expect(r.ok, `case ${i} ${mode}`).toBe(true);
      if (!r.ok) continue;
      expect(r.shares.reduce((sum, s) => sum + s.amount, 0), `case ${i} sum`).toBe(total);
      const auto = r.shares.filter((_, k) => values[k] === null).map((s) => s.amount);
      expect(Math.max(...auto) - Math.min(...auto), `case ${i} spread`).toBeLessThanOrEqual(1);
    }
  });
});
