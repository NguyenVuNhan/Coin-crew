import { describe, it, expect } from 'vitest';
import { computeShares, type SplitMode, type SplitResult } from '../src/split';

const e = (ids: string[], values: number[] = []) => ids.map((id, i) => ({ participantId: id, value: values[i] ?? 1 }));
const amounts = (r: SplitResult) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.shares.map((s) => s.amount);
};

describe('computeShares', () => {
  it('equal, leftover đồng to earliest', () => expect(amounts(computeShares(100000, 'equal', e(['a', 'b', 'c'])))).toEqual([33334, 33333, 33333]));
  it('equal homestay', () => expect(amounts(computeShares(3200000, 'equal', e(['a', 'b', 'c', 'd'])))).toEqual([800000, 800000, 800000, 800000]));
  it('percent tie', () => expect(amounts(computeShares(100001, 'percent', e(['a', 'b'], [5000, 5000])))).toEqual([50001, 50000]));
  it('percent must be 100', () => expect(computeShares(100, 'percent', e(['a', 'b', 'c'], [3333, 3333, 3333]))).toEqual({ ok: false, error: 'PERCENT_NOT_100' }));
  it('shares largest remainder', () => expect(amounts(computeShares(1000, 'shares', e(['a', 'b'], [200, 100])))).toEqual([667, 333]));
  it('shares 2/1/1', () => expect(amounts(computeShares(600000, 'shares', e(['a', 'b', 'c'], [200, 100, 100])))).toEqual([300000, 150000, 150000]));
  it('shares positive', () => expect(computeShares(100, 'shares', e(['a', 'b'], [0, 100]))).toEqual({ ok: false, error: 'SHARES_NOT_POSITIVE' }));
  it('amounts exact', () => expect(amounts(computeShares(80000, 'amounts', e(['a', 'b'], [50000, 30000])))).toEqual([50000, 30000]));
  it('amounts must add up', () => expect(computeShares(80000, 'amounts', e(['a', 'b'], [50000, 20000]))).toEqual({ ok: false, error: 'AMOUNTS_DONT_ADD_UP' }));
  it('adjust plus', () => expect(amounts(computeShares(180000, 'adjust', e(['a', 'b', 'c', 'd'], [20000, 0, 0, 0])))).toEqual([60000, 40000, 40000, 40000]));
  it('adjust minus', () => expect(amounts(computeShares(100000, 'adjust', e(['a', 'b'], [-60000, 0])))).toEqual([20000, 80000]));
  it('adjust negative share', () => expect(computeShares(100000, 'adjust', e(['a', 'b'], [-120000, 0]))).toEqual({ ok: false, error: 'NEGATIVE_SHARE' }));
  it('invalid totals', () => {
    expect(computeShares(0, 'equal', e(['a']))).toEqual({ ok: false, error: 'INVALID_AMOUNT' });
    expect(computeShares(10_000_000_001, 'equal', e(['a']))).toEqual({ ok: false, error: 'INVALID_AMOUNT' });
    expect(computeShares(100, 'equal', [])).toEqual({ ok: false, error: 'NO_PARTICIPANTS' });
  });
  it('keeps participant ids in entry order', () => {
    const r = computeShares(90, 'equal', e(['x', 'y', 'z']));
    expect(r.ok && r.shares.map((s) => s.participantId)).toEqual(['x', 'y', 'z']);
  });

  it('always sums to total (200 seeded random cases, all modes)', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const modes: SplitMode[] = ['equal', 'percent', 'shares', 'adjust', 'amounts'];
    for (let i = 0; i < 200; i++) {
      const n = 1 + Math.floor(rnd() * 7);
      const total = 1 + Math.floor(rnd() * 50_000_000);
      const ids = Array.from({ length: n }, (_, k) => `p${k}`);
      const mode = modes[i % modes.length]!;
      let values: number[];
      if (mode === 'percent') {
        values = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 100));
        const sum = values.reduce((a, b) => a + b, 0);
        values = values.map((v) => Math.floor((v * 10000) / sum));
        values[0]! += 10000 - values.reduce((a, b) => a + b, 0);
      } else if (mode === 'shares') {
        values = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 500));
      } else if (mode === 'adjust') {
        values = Array.from({ length: n }, () => Math.floor(rnd() * Math.floor(total / (2 * n))));
      } else if (mode === 'amounts') {
        values = Array.from({ length: n }, () => Math.floor(total / n));
        values[0]! += total - values.reduce((a, b) => a + b, 0);
      } else {
        values = [];
      }
      const r = computeShares(total, mode, e(ids, values));
      expect(r.ok, `case ${i} ${mode}`).toBe(true);
      if (r.ok) {
        expect(r.shares.reduce((a, s) => a + s.amount, 0), `case ${i} ${mode}`).toBe(total);
        expect(r.shares.every((s) => Number.isInteger(s.amount) && s.amount >= 0)).toBe(true);
      }
    }
  });
});
