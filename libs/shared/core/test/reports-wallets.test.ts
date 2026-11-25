import { describe, it, expect } from 'vitest';
import {
  replayEntryVndAmounts,
  walletBalanceSeries,
  walletBalance,
  type CalcWallet,
  type CalcEntry,
  type PersonalEntryType,
} from '../src/wallets';

let nextId = 1;

function wallet(
  overrides: Partial<CalcWallet> & Pick<CalcWallet, 'id' | 'currency'>,
): CalcWallet {
  const defaultCost =
    overrides.currency === 'VND'
      ? null
      : (overrides.startAmount ?? 0) === 0
        ? null
        : 0;
  return {
    startAmount: 0,
    startDate: '2026-11-01',
    startCostVnd: defaultCost,
    archived: false,
    ...overrides,
  };
}

function e(
  walletId: string,
  type: PersonalEntryType,
  amount: number,
  date: string,
  overrides?: Partial<CalcEntry>,
): CalcEntry {
  const id = `e${nextId++}`;
  return {
    id,
    walletId,
    type,
    amount,
    date,
    time: null,
    createdAt: `${date}T00:00:00Z`,
    transferId: null,
    excludeFromReports: false,
    ...overrides,
  };
}

function transfer(
  id: string,
  fromWalletId: string,
  amountSent: number,
  toWalletId: string,
  amountReceived: number,
  date: string,
): [CalcEntry, CalcEntry] {
  return [
    {
      id: `${id}-out`,
      walletId: fromWalletId,
      type: 'transfer_out',
      amount: amountSent,
      date,
      time: null,
      createdAt: `${date}T00:00:00Z`,
      transferId: id,
      excludeFromReports: true,
    },
    {
      id: `${id}-in`,
      walletId: toWalletId,
      type: 'transfer_in',
      amount: amountReceived,
      date,
      time: null,
      createdAt: `${date}T00:00:00Z`,
      transferId: id,
      excludeFromReports: true,
    },
  ];
}

describe('reports-wallets', () => {
  it('1. VND wallet entries return exact entry.amount in entryVnd, and unratedWalletIds is empty', () => {
    const w = wallet({ id: 'v', currency: 'VND', startAmount: 10_000_000 });
    const e1 = e('v', 'expense', 500_000, '2026-11-02');
    const e2 = e('v', 'income', 1_200_000, '2026-11-03');
    const res = replayEntryVndAmounts([w], [e1, e2]);

    expect(res.entryVnd.get(e1.id)).toBe(500_000);
    expect(res.entryVnd.get(e2.id)).toBe(1_200_000);
    expect(res.unratedWalletIds.size).toBe(0);
  });

  it('2. W12 moving-average conversion: multi-inflow moving average and subsequent expense and income', () => {
    const bank = wallet({ id: 'b', currency: 'VND', startAmount: 50_000_000 });
    const usdt = wallet({ id: 'u', currency: 'USDT', startAmount: 0, startCostVnd: null });
    const t1 = transfer('t1', 'b', 25_000_000, 'u', 100_000, '2026-11-01');
    const t2 = transfer('t2', 'b', 13_000_000, 'u', 50_000, '2026-11-05');
    const exp = e('u', 'expense', 30_000, '2026-11-10');
    const inc = e('u', 'income', 10_000, '2026-11-12');

    const res = replayEntryVndAmounts([bank, usdt], [...t1, ...t2, exp, inc]);
    expect(res.entryVnd.get(exp.id)).toBe(7_600_000);
    expect(res.entryVnd.get(inc.id)).toBe(Math.round((30_400_000 / 120_000) * 10_000));
    expect(res.unratedWalletIds.has('u')).toBe(false);
  });

  it('3. Retroactive W19c rating backfills pending unrated entries upon first rated inflow', () => {
    const bank = wallet({ id: 'b', currency: 'VND', startAmount: 50_000_000 });
    const usdt = wallet({ id: 'u', currency: 'USDT', startAmount: 0, startCostVnd: null });
    const exp = e('u', 'expense', 10_000, '2026-11-01');
    const t1 = transfer('t1', 'b', 26_000_000, 'u', 100_000, '2026-11-05');

    const res = replayEntryVndAmounts([bank, usdt], [exp, ...t1]);
    expect(res.entryVnd.get(exp.id)).toBe(2_600_000);
    expect(res.unratedWalletIds.has('u')).toBe(false);
  });

  it('4. Permanently unrated wallet sets entryVnd to null and wallet id in unratedWalletIds', () => {
    const usdt = wallet({ id: 'u', currency: 'USDT', startAmount: 0, startCostVnd: null });
    const exp = e('u', 'expense', 5_000, '2026-11-02');

    const res = replayEntryVndAmounts([usdt], [exp]);
    expect(res.entryVnd.get(exp.id)).toBeNull();
    expect(res.unratedWalletIds.has('u')).toBe(true);
  });

  it('5. Negative balance rate carry: spending past 0 on a rated USDT wallet preserves lastRate', () => {
    const usdt = wallet({
      id: 'u',
      currency: 'USDT',
      startAmount: 10_000,
      startCostVnd: 2_600_000,
    });
    const exp1 = e('u', 'expense', 15_000, '2026-11-02');
    const exp2 = e('u', 'expense', 5_000, '2026-11-03');

    const res = replayEntryVndAmounts([usdt], [exp1, exp2]);
    expect(res.entryVnd.get(exp1.id)).toBe(3_900_000);
    expect(res.entryVnd.get(exp2.id)).toBe(1_300_000);
  });

  it('6. walletBalanceSeries daily mode: opening from past entries, period updates, stops at today, min/max, invariant', () => {
    const w = wallet({ id: 'w1', currency: 'VND', startAmount: 10_000_000 });
    const pastEntry = e('w1', 'income', 2_000_000, '2026-10-25');
    const exp = e('w1', 'expense', 500_000, '2026-11-03');
    const buy = e('w1', 'buy', 1_000_000, '2026-11-08', { assetId: 'a1', quantity: 10 });
    const sell = e('w1', 'sell', 400_000, '2026-11-12', { assetId: 'a1', quantity: 4 });
    const xferOut = e('w1', 'transfer_out', 2_000_000, '2026-11-15', { transferId: 't1' });
    const inc = e('w1', 'income', 5_000_000, '2026-11-20');

    const entries = [pastEntry, exp, buy, sell, xferOut, inc];
    const series = walletBalanceSeries(
      w,
      entries,
      { from: '2026-11-01', to: '2026-11-30', granularity: 'day' },
      '2026-11-24',
    );

    expect(series.walletId).toBe('w1');
    expect(series.currency).toBe('VND');
    expect(series.opening).toBe(12_000_000);
    expect(series.points).toHaveLength(24);
    expect(series.points[0]).toEqual({ date: '2026-11-01', label: '01/11', balance: 12_000_000 });
    expect(series.points[series.points.length - 1]).toEqual({
      date: '2026-11-24',
      label: '24/11',
      balance: 13_900_000,
    });
    expect(series.closing).toBe(13_900_000);
    expect(series.netChange).toBe(1_900_000);
    expect(series.min).toEqual({ value: 8_900_000, date: '2026-11-15' });
    expect(series.max).toEqual({ value: 13_900_000, date: '2026-11-20' });
    expect(series.closing).toBe(walletBalance(w, entries));
  });

  it('7. walletBalanceSeries monthly mode (granularity: month) produces 11 points (T1..T11) ending at today', () => {
    const w = wallet({ id: 'w1', currency: 'VND', startAmount: 5_000_000 });
    const series = walletBalanceSeries(
      w,
      [],
      { from: '2026-01-01', to: '2026-12-31', granularity: 'month' },
      '2026-11-24',
    );

    expect(series.points).toHaveLength(11);
    expect(series.points.map((p) => p.label)).toEqual([
      'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11',
    ]);
    expect(series.points[0]!.date).toBe('2026-01-31');
    expect(series.points[10]!.date).toBe('2026-11-24');
    expect(series.closing).toBe(5_000_000);
    expect(series.opening).toBe(5_000_000);
    expect(series.netChange).toBe(0);
    expect(series.closing).toBe(walletBalance(w, []));
  });

  it('8. Future period (period.from > today): returns points: [], closing === opening, netChange === 0', () => {
    const w = wallet({ id: 'w1', currency: 'VND', startAmount: 5_000_000 });
    const pastEntry = e('w1', 'income', 1_000_000, '2026-11-01');
    const series = walletBalanceSeries(
      w,
      [pastEntry],
      { from: '2026-12-01', to: '2026-12-31', granularity: 'day' },
      '2026-11-24',
    );

    expect(series.points).toEqual([]);
    expect(series.opening).toBe(6_000_000);
    expect(series.closing).toBe(6_000_000);
    expect(series.netChange).toBe(0);
    expect(series.min).toEqual({ value: 6_000_000, date: '2026-12-01' });
    expect(series.max).toEqual({ value: 6_000_000, date: '2026-12-01' });
  });
});
