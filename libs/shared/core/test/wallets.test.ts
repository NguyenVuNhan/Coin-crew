import { describe, it, expect } from 'vitest';
import {
  isBeforeStart,
  walletBalance,
  walletVndValues,
  vndTotal,
  sumCounted,
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

describe('wallets', () => {
  const bank = wallet({ id: 'b', currency: 'VND', startAmount: 30_000_000 });
  const ex = wallet({ id: 'x', currency: 'USDT', startAmount: 0, startCostVnd: null });

  it('entries before the start date are ignored', () => {
    const w = wallet({ id: 'v', currency: 'VND', startAmount: 1_000_000, startDate: '2026-11-10' });
    expect(walletBalance(w, [e('v', 'expense', 200_000, '2026-11-09'), e('v', 'income', 50_000, '2026-11-10')])).toBe(1_050_000);
    expect(isBeforeStart({ date: '2026-11-09' }, { startDate: '2026-11-10' })).toBe(true);
    expect(isBeforeStart({ date: '2026-11-10' }, { startDate: '2026-11-10' })).toBe(false);
  });

  it('a VND → USDT transfer moves balances and VND cost', () => {
    const bank = wallet({ id: 'b', currency: 'VND', startAmount: 30_000_000 });
    const ex = wallet({ id: 'x', currency: 'USDT', startAmount: 0, startCostVnd: null });
    const es = transfer('t1', 'b', 25_000_000, 'x', 100_000, '2026-11-11');
    expect(walletBalance(bank, es)).toBe(5_000_000);
    expect(walletBalance(ex, es)).toBe(100_000);
    expect(walletVndValues([bank, ex], es).get('x')).toBe(25_000_000);
  });

  it('average rate after a second transfer and a spend (design §11)', () => {
    // 25.000.000 → 1.000 USDT, then 13.000.000 → 500 USDT, then spend 300 USDT
    const es = [...transfer('t1', 'b', 25_000_000, 'x', 100_000, '2026-11-11'), ...transfer('t2', 'b', 13_000_000, 'x', 50_000, '2026-11-12'), e('x', 'expense', 30_000, '2026-11-13')];
    const v = walletVndValues([bank, ex], es);
    expect(v.get('x')).toBe(30_400_000);
  });

  it('USD → USDT carries the sender\'s average cost', () => {
    // USD wallet start 1.000,00 $ worth 25.000.000; send 400,00 $ for 399,00 USDT → USDT value 10.000.000, USD value 15.000.000
    const usd = wallet({ id: 'u', currency: 'USD', startAmount: 100_000, startCostVnd: 25_000_000 });
    const usdt = wallet({ id: 't', currency: 'USDT', startAmount: 0, startCostVnd: null });
    const es = transfer('t1', 'u', 40_000, 't', 39_900, '2026-11-11');
    const v = walletVndValues([usd, usdt], es);
    expect(v.get('t')).toBe(10_000_000);
    expect(v.get('u')).toBe(15_000_000);
  });

  it('a USDT wallet with no rate yet is unrated, then valued at the first transfer-in rate', () => {
    // start 0, income 10,00 USDT → unrated; then transfer 2.500.000 VND → 100,00 USDT → value (10+100)/100 × 2.500.000 = 2.750.000
    const vnd = wallet({ id: 'b', currency: 'VND', startAmount: 10_000_000 });
    const usdt = wallet({ id: 'x', currency: 'USDT', startAmount: 0, startCostVnd: null });
    const inc = e('x', 'income', 1_000, '2026-11-10');
    expect(walletVndValues([vnd, usdt], [inc]).get('x')).toBeNull();
    const totBefore = vndTotal([vnd, usdt], [inc]);
    expect(totBefore.unratedWalletIds).toEqual(['x']);
    expect(totBefore.totalVnd).toBe(10_000_000);

    const es = [inc, ...transfer('t1', 'b', 2_500_000, 'x', 10_000, '2026-11-11')];
    const v = walletVndValues([vnd, usdt], es);
    expect(v.get('x')).toBe(2_750_000);
  });

  it('below zero the cost follows the balance at the last rate', () => {
    // 100,00 USDT worth 2.500.000, spend 150,00 → balance -5.000, value -1.250.000
    const usdt = wallet({ id: 'x', currency: 'USDT', startAmount: 10_000, startCostVnd: 2_500_000 });
    const es = [e('x', 'expense', 15_000, '2026-11-11')];
    expect(walletBalance(usdt, es)).toBe(-5_000);
    expect(walletVndValues([usdt], es).get('x')).toBe(-1_250_000);
  });

  it('archived wallets stay out of the total', () => {
    // archived VND wallet of 9.000.000 not in totalVnd
    const active = wallet({ id: 'a', currency: 'VND', startAmount: 5_000_000 });
    const arch = wallet({ id: 'z', currency: 'VND', startAmount: 9_000_000, archived: true });
    const tot = vndTotal([active, arch], []);
    expect(tot.totalVnd).toBe(5_000_000);
    expect(tot.perCurrency).toEqual([{ currency: 'VND', balance: 5_000_000 }]);
  });

  it('vndTotal marks converted totals approximate and lists per currency', () => {
    // VND 5.000.000 + USDT 1.000,00 at 25.000.000 → totalVnd 30.000.000, approximate true, perCurrency [VND 5.000.000, USDT 100.000]
    const vnd = wallet({ id: 'b', currency: 'VND', startAmount: 5_000_000 });
    const usdt = wallet({ id: 'x', currency: 'USDT', startAmount: 100_000, startCostVnd: 25_000_000 });
    const tot = vndTotal([usdt, vnd], []);
    expect(tot).toEqual({
      totalVnd: 30_000_000,
      approximate: true,
      perCurrency: [
        { currency: 'VND', balance: 5_000_000 },
        { currency: 'USDT', balance: 100_000 },
      ],
      unratedWalletIds: [],
    });
  });

  it('sumCounted skips excluded rows', () => {
    expect(sumCounted([{ currency: 'VND', signedAmount: -50_000, counted: true }, { currency: 'VND', signedAmount: -10_000, counted: false }, { currency: 'VND', signedAmount: 200_000, counted: true }]))
      .toEqual([{ currency: 'VND', spent: 50_000, income: 200_000 }]);
  });
});
