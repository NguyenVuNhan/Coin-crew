import { describe, it, expect } from 'vitest';
import { computeShares, computeSportShares, type SplitMode, type SplitResult } from '../src/split';
import { parseVnd } from '../src/money';

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

describe('computeSportShares', () => {
  it('discount mode: 4M + 2F with 15k female discount and 1 fixed latecomer (380k total)', () => {
    const r = computeSportShares(
      380000,
      { kind: 'discount', femaleDiscount: 15000 },
      [
        { participantId: 'm1', maleSlots: 1, femaleSlots: 0 },
        { participantId: 'm2', maleSlots: 1, femaleSlots: 0 },
        { participantId: 'm3', maleSlots: 1, femaleSlots: 0 },
        { participantId: 'm4', maleSlots: 1, femaleSlots: 0 },
        { participantId: 'f1', maleSlots: 0, femaleSlots: 1 },
        { participantId: 'f2', maleSlots: 0, femaleSlots: 1 },
        { participantId: 'late', maleSlots: 1, femaleSlots: 0, fixedAmount: 40000 },
      ],
    );
    expect(r).toEqual({
      ok: true,
      maleSlotRate: 61667,
      femaleSlotRate: 46667,
      totalMaleSlots: 4,
      totalFemaleSlots: 2,
      shares: [
        { participantId: 'm1', amount: 61667 },
        { participantId: 'm2', amount: 61667 },
        { participantId: 'm3', amount: 61667 },
        { participantId: 'm4', amount: 61667 },
        { participantId: 'f1', amount: 46666 },
        { participantId: 'f2', amount: 46666 },
        { participantId: 'late', amount: 40000 },
      ],
    });
  });

  it('Review Focus 2: Excel sheet multi-slot + 26.67k decimal shuttlecock price sums to exact total', () => {
    const shuttleUnit = parseVnd('26.67k')!;
    expect(shuttleUnit).toBe(26670);
    const total = 420000 + 3 * shuttleUnit; // 500.010₫
    const r = computeSportShares(
      total,
      { kind: 'ratio', maleWeight: 100, femaleWeight: 75 },
      [
        { participantId: 'quang', maleSlots: 6, femaleSlots: 2 },
        { participantId: 'chi', maleSlots: 1, femaleSlots: 1 },
        { participantId: 'duc', maleSlots: 1, femaleSlots: 1 },
        { participantId: 'minh', maleSlots: 6, femaleSlots: 1 },
      ],
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.totalMaleSlots).toBe(14);
      expect(r.totalFemaleSlots).toBe(5);
      expect(r.shares.reduce((s, x) => s + x.amount, 0)).toBe(total);
    }
  });

  it('Review Focus 1: single-gender pool with non-zero discount splits equally per slot without error', () => {
    const r = computeSportShares(
      240000,
      { kind: 'discount', femaleDiscount: 15000 },
      [
        { participantId: 'm1', maleSlots: 2, femaleSlots: 0 },
        { participantId: 'm2', maleSlots: 2, femaleSlots: 0 },
      ],
    );
    expect(r).toEqual({
      ok: true,
      maleSlotRate: 60000,
      femaleSlotRate: 0,
      totalMaleSlots: 4,
      totalFemaleSlots: 0,
      shares: [
        { participantId: 'm1', amount: 120000 },
        { participantId: 'm2', amount: 120000 },
      ],
    });
  });

  it('rejects when discount makes female share negative or fixed exceeds total', () => {
    expect(
      computeSportShares(
        100000,
        { kind: 'discount', femaleDiscount: 60000 },
        [
          { participantId: 'm1', maleSlots: 2, femaleSlots: 0 },
          { participantId: 'f1', maleSlots: 0, femaleSlots: 1 },
        ],
      ),
    ).toEqual({ ok: false, error: 'NEGATIVE_SHARE' });

    expect(
      computeSportShares(
        100000,
        { kind: 'equal' },
        [
          { participantId: 'p1', maleSlots: 1, femaleSlots: 0, fixedAmount: 120000 },
          { participantId: 'p2', maleSlots: 1, femaleSlots: 0 },
        ],
      ),
    ).toEqual({ ok: false, error: 'AMOUNTS_DONT_ADD_UP' });
  });

  it('handles all-female pool with discount correctly', () => {
    const r = computeSportShares(
      150000,
      { kind: 'discount', femaleDiscount: 20000 },
      [
        { participantId: 'f1', maleSlots: 0, femaleSlots: 1 },
        { participantId: 'f2', maleSlots: 0, femaleSlots: 2 },
      ],
    );
    expect(r).toEqual({
      ok: true,
      maleSlotRate: 0,
      femaleSlotRate: 50000,
      totalMaleSlots: 0,
      totalFemaleSlots: 3,
      shares: [
        { participantId: 'f1', amount: 50000 },
        { participantId: 'f2', amount: 100000 },
      ],
    });
  });

  it('handles all-fixed pool matching total', () => {
    const r = computeSportShares(
      100000,
      { kind: 'equal' },
      [
        { participantId: 'p1', maleSlots: 0, femaleSlots: 0, fixedAmount: 40000 },
        { participantId: 'p2', maleSlots: 0, femaleSlots: 0, fixedAmount: 60000 },
      ],
    );
    expect(r).toEqual({
      ok: true,
      maleSlotRate: 0,
      femaleSlotRate: 0,
      totalMaleSlots: 0,
      totalFemaleSlots: 0,
      shares: [
        { participantId: 'p1', amount: 40000 },
        { participantId: 'p2', amount: 60000 },
      ],
    });
  });

  it('filters inactive participants with 0 slots and no fixed amount', () => {
    const r = computeSportShares(
      100000,
      { kind: 'equal' },
      [
        { participantId: 'p1', maleSlots: 1, femaleSlots: 0 },
        { participantId: 'inactive', maleSlots: 0, femaleSlots: 0 },
        { participantId: 'p2', maleSlots: 1, femaleSlots: 0 },
      ],
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.shares).toEqual([
        { participantId: 'p1', amount: 50000 },
        { participantId: 'p2', amount: 50000 },
      ]);
    }
  });

  it('rejects invalid inputs', () => {
    expect(computeSportShares(0, { kind: 'equal' }, [{ participantId: 'p1', maleSlots: 1, femaleSlots: 0 }]))
      .toEqual({ ok: false, error: 'INVALID_AMOUNT' });
    expect(computeSportShares(100000, { kind: 'equal' }, []))
      .toEqual({ ok: false, error: 'NO_PARTICIPANTS' });
    expect(computeSportShares(100000, { kind: 'equal' }, [{ participantId: 'p1', maleSlots: 0, femaleSlots: 0 }]))
      .toEqual({ ok: false, error: 'NO_PARTICIPANTS' });
    expect(computeSportShares(100000, { kind: 'equal' }, [{ participantId: 'p1', maleSlots: -1, femaleSlots: 0 }]))
      .toEqual({ ok: false, error: 'INVALID_VALUE' });
    expect(computeSportShares(100000, { kind: 'equal' }, [{ participantId: 'p1', maleSlots: 1, femaleSlots: 0, fixedAmount: -100 }]))
      .toEqual({ ok: false, error: 'NEGATIVE_SHARE' });
    expect(computeSportShares(100000, { kind: 'ratio', maleWeight: 0, femaleWeight: 1 }, [{ participantId: 'p1', maleSlots: 1, femaleSlots: 0 }]))
      .toEqual({ ok: false, error: 'INVALID_VALUE' });
    expect(computeSportShares(100000, { kind: 'discount', femaleDiscount: -500 }, [{ participantId: 'p1', maleSlots: 1, femaleSlots: 0 }]))
      .toEqual({ ok: false, error: 'INVALID_VALUE' });
  });

  it('always sums to total (200 seeded random sport split cases)', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 200; i++) {
      const n = 1 + Math.floor(rnd() * 8);
      const total = 10000 + Math.floor(rnd() * 50_000_000);
      const ruleKind = i % 3 === 0 ? 'equal' : i % 3 === 1 ? 'discount' : 'ratio';
      let rule: any;
      if (ruleKind === 'equal') {
        rule = { kind: 'equal' };
      } else if (ruleKind === 'discount') {
        rule = { kind: 'discount', femaleDiscount: Math.floor(rnd() * 20000) };
      } else {
        rule = { kind: 'ratio', maleWeight: 1 + Math.floor(rnd() * 100), femaleWeight: 1 + Math.floor(rnd() * 100) };
      }
      const entries = Array.from({ length: n }, (_, k) => ({
        participantId: `p${k}`,
        maleSlots: Math.floor(rnd() * 3),
        femaleSlots: Math.floor(rnd() * 3),
      }));
      if (entries.every((e) => e.maleSlots + e.femaleSlots === 0)) {
        entries[0]!.maleSlots = 1;
      }
      const r = computeSportShares(total, rule, entries);
      if (r.ok) {
        expect(r.shares.reduce((sum, s) => sum + s.amount, 0), `sport case ${i}`).toBe(total);
        expect(r.shares.every((s) => Number.isInteger(s.amount) && s.amount >= 0)).toBe(true);
      }
    }
  });
});

