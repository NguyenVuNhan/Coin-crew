import { describe, it, expect } from 'vitest';
import {
  walletBalance,
  walletHoldings,
  findOversell,
  walletVndValues,
  vndTotal,
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

function entry(
  walletId: string,
  type: PersonalEntryType,
  amount: number,
  date: string,
  overrides?: Partial<CalcEntry>,
): CalcEntry {
  const id = `h${nextId++}`;
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
    assetId: null,
    quantity: null,
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
  time: string | null = null,
): [CalcEntry, CalcEntry] {
  return [
    {
      id: `${id}-out`,
      walletId: fromWalletId,
      type: 'transfer_out',
      amount: amountSent,
      date,
      time,
      createdAt: `${date}T00:00:00Z`,
      transferId: id,
      excludeFromReports: true,
      assetId: null,
      quantity: null,
    },
    {
      id: `${id}-in`,
      walletId: toWalletId,
      type: 'transfer_in',
      amount: amountReceived,
      date,
      time,
      createdAt: `${date}T00:00:00Z`,
      transferId: id,
      excludeFromReports: true,
      assetId: null,
      quantity: null,
    },
  ];
}

describe('holdings and buy/sell', () => {
  it('computes buys then a partial sell in a VND wallet', () => {
    const w = wallet({ id: 'w-vnd', currency: 'VND', startAmount: 3_000_000_000 });
    const entries: CalcEntry[] = [
      entry('w-vnd', 'buy', 1_000_000_000, '2026-11-02', {
        assetId: 'btc',
        quantity: 100_000_000,
      }),
      entry('w-vnd', 'buy', 1_400_000_000, '2026-11-03', {
        assetId: 'btc',
        quantity: 100_000_000,
      }),
      entry('w-vnd', 'sell', 800_000_000, '2026-11-04', {
        assetId: 'btc',
        quantity: 50_000_000,
      }),
    ];

    expect(walletBalance(w, entries)).toBe(3_000_000_000 - 2_400_000_000 + 800_000_000);
    expect(walletHoldings(w, entries)).toEqual([
      {
        assetId: 'btc',
        quantity: 150_000_000,
        cost: 1_800_000_000,
        costVnd: 1_800_000_000,
      },
    ]);
    const vals = walletVndValues([w], entries);
    expect(vals.get('w-vnd')).toBe(1_400_000_000 + 1_800_000_000);
  });

  it('drops holding when fully sold', () => {
    const w = wallet({ id: 'w-vnd', currency: 'VND', startAmount: 1_000_000_000 });
    const entries: CalcEntry[] = [
      entry('w-vnd', 'buy', 500_000_000, '2026-11-02', {
        assetId: 'btc',
        quantity: 100_000_000,
      }),
      entry('w-vnd', 'sell', 600_000_000, '2026-11-03', {
        assetId: 'btc',
        quantity: 100_000_000,
      }),
    ];

    expect(walletHoldings(w, entries)).toEqual([]);
  });

  it('tracks cash and holding VND cost in a USDT wallet', () => {
    const vnd = wallet({ id: 'w-vnd', currency: 'VND', startAmount: 25_000_000 });
    const usdt = wallet({ id: 'w-usdt', currency: 'USDT', startAmount: 0 });
    const [tOut, tIn] = transfer('t1', 'w-vnd', 25_000_000, 'w-usdt', 100_000, '2026-11-02');
    const buyBtc = entry('w-usdt', 'buy', 40_000, '2026-11-03', {
      assetId: 'btc',
      quantity: 100_000_000,
    });

    const entriesAfterBuy = [tOut, tIn, buyBtc];
    expect(walletBalance(usdt, entriesAfterBuy)).toBe(60_000);
    const vndAfterBuy = walletVndValues([vnd, usdt], entriesAfterBuy);
    expect(vndAfterBuy.get('w-usdt')).toBe(25_000_000);

    // Check holding costVnd when rated via startCostVnd
    const ratedUsdt = wallet({
      id: 'w-usdt',
      currency: 'USDT',
      startAmount: 100_000,
      startCostVnd: 25_000_000,
    });
    expect(walletHoldings(ratedUsdt, [buyBtc])).toEqual([
      {
        assetId: 'btc',
        quantity: 100_000_000,
        cost: 40_000,
        costVnd: 10_000_000,
      },
    ]);

    const sellHalf = entry('w-usdt', 'sell', 30_000, '2026-11-04', {
      assetId: 'btc',
      quantity: 50_000_000,
    });
    const entriesAfterSell = [tOut, tIn, buyBtc, sellHalf];
    expect(walletBalance(usdt, entriesAfterSell)).toBe(90_000);
    expect(walletHoldings(ratedUsdt, [buyBtc, sellHalf])).toEqual([
      {
        assetId: 'btc',
        quantity: 50_000_000,
        cost: 20_000,
        costVnd: 5_000_000,
      },
    ]);
    const vndAfterSell = walletVndValues([vnd, usdt], entriesAfterSell);
    // Cash: 900 USDT * 25.000 = 22.500.000; Holding: 5.000.000 -> Total 27.500.000
    expect(vndAfterSell.get('w-usdt')).toBe(27_500_000);
  });

  it('detects oversell in chronological order', () => {
    const w = wallet({ id: 'w-vnd', currency: 'VND', startAmount: 2_000_000_000 });
    const sellEarly = entry('w-vnd', 'sell', 500_000_000, '2026-11-02', {
      assetId: 'btc',
      quantity: 50_000_000,
    });
    const buyLater = entry('w-vnd', 'buy', 1_000_000_000, '2026-11-05', {
      assetId: 'btc',
      quantity: 100_000_000,
    });

    expect(findOversell(w, [buyLater, sellEarly])).toEqual({
      assetId: 'btc',
      date: '2026-11-02',
    });

    const buyFirst = entry('w-vnd', 'buy', 1_000_000_000, '2026-11-01', {
      assetId: 'btc',
      quantity: 100_000_000,
    });
    expect(findOversell(w, [buyFirst, sellEarly])).toBeNull();
  });

  it('orders same-date entries by time then createdAt for oversell', () => {
    const w = wallet({ id: 'w-vnd', currency: 'VND', startAmount: 2_000_000_000 });
    const sellMorning = entry('w-vnd', 'sell', 500_000_000, '2026-11-02', {
      assetId: 'btc',
      quantity: 50_000_000,
      time: '09:00',
    });
    const buyTen = entry('w-vnd', 'buy', 1_000_000_000, '2026-11-02', {
      assetId: 'btc',
      quantity: 100_000_000,
      time: '10:00',
    });
    expect(findOversell(w, [buyTen, sellMorning])).toEqual({
      assetId: 'btc',
      date: '2026-11-02',
    });

    const sellNoTimeFirst = entry('w-vnd', 'sell', 500_000_000, '2026-11-02', {
      assetId: 'btc',
      quantity: 50_000_000,
      time: null,
      createdAt: '2026-11-02T08:00:00Z',
    });
    const buyNoTimeSecond = entry('w-vnd', 'buy', 1_000_000_000, '2026-11-02', {
      assetId: 'btc',
      quantity: 100_000_000,
      time: null,
      createdAt: '2026-11-02T09:00:00Z',
    });
    expect(findOversell(w, [buyNoTimeSecond, sellNoTimeFirst])).toEqual({
      assetId: 'btc',
      date: '2026-11-02',
    });

    const buyNoTimeFirst = entry('w-vnd', 'buy', 1_000_000_000, '2026-11-02', {
      assetId: 'btc',
      quantity: 100_000_000,
      time: null,
      createdAt: '2026-11-02T07:00:00Z',
    });
    expect(findOversell(w, [sellNoTimeFirst, buyNoTimeFirst])).toBeNull();
  });

  it('ignores buys and sells before startDate', () => {
    const w = wallet({
      id: 'w-vnd',
      currency: 'VND',
      startAmount: 1_000_000_000,
      startDate: '2026-11-10',
    });
    const entries: CalcEntry[] = [
      entry('w-vnd', 'buy', 500_000_000, '2026-11-01', {
        assetId: 'btc',
        quantity: 100_000_000,
      }),
      entry('w-vnd', 'sell', 500_000_000, '2026-11-02', {
        assetId: 'btc',
        quantity: 200_000_000,
      }),
    ];
    expect(walletHoldings(w, entries)).toEqual([]);
    expect(findOversell(w, entries)).toBeNull();
  });

  it('skips archived investment wallet holdings in vndTotal', () => {
    const active = wallet({ id: 'w-1', currency: 'VND', startAmount: 1_000_000 });
    const archived = wallet({
      id: 'w-2',
      currency: 'VND',
      startAmount: 5_000_000,
      archived: true,
    });
    const buyInArchived = entry('w-2', 'buy', 3_000_000, '2026-11-02', {
      assetId: 'gold',
      quantity: 1,
    });

    const total = vndTotal([active, archived], [buyInArchived]);
    expect(total.totalVnd).toBe(1_000_000);
  });

  it('handles unrated wallet (W19c) until first transfer-in', () => {
    const vnd = wallet({ id: 'w-vnd', currency: 'VND', startAmount: 25_000_000 });
    const usdt = wallet({
      id: 'w-usdt',
      currency: 'USDT',
      startAmount: 100_000,
      startCostVnd: null,
    });
    const buyBtc = entry('w-usdt', 'buy', 40_000, '2026-11-02', {
      assetId: 'btc',
      quantity: 100_000_000,
    });

    // Before transfer-in: unrated
    expect(walletHoldings(usdt, [buyBtc])).toEqual([
      {
        assetId: 'btc',
        quantity: 100_000_000,
        cost: 40_000,
        costVnd: null,
      },
    ]);
    expect(walletVndValues([vnd, usdt], [buyBtc]).get('w-usdt')).toBeNull();

    // After first transfer-in: 25.000.000 VND -> 1.000 USDT
    const [tOut, tIn] = transfer('t2', 'w-vnd', 25_000_000, 'w-usdt', 100_000, '2026-11-03');
    const vals = walletVndValues([vnd, usdt], [buyBtc, tOut, tIn]);
    // 600 unrated cash + 400 unrated holding + 1000 transferred in = 2000 USDT * 25.000 = 50.000.000 VND
    expect(vals.get('w-usdt')).toBe(50_000_000);
  });
});
