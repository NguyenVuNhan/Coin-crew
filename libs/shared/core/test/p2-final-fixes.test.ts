import { describe, expect, it } from 'vitest';
import { vndTotal, type CalcEntry, type CalcWallet } from '../src/wallets';

describe('M1: vndTotal approximate with non-VND wallet holdings', () => {
  it('sets approximate=true when a non-VND wallet has 0 cash balance but holds an asset', () => {
    const wallet: CalcWallet = {
      id: 'w-usd-inv',
      currency: 'USD',
      startAmount: 100_00,
      startDate: '2026-11-01',
      startCostVnd: 2_500_000,
      archived: false,
    };

    const buyAll: CalcEntry = {
      id: 'e-buy',
      walletId: 'w-usd-inv',
      type: 'buy',
      amount: 100_00,
      date: '2026-11-02',
      time: null,
      excludeFromReports: false,
      createdAt: '2026-11-02T10:00:00.000Z',
      transferId: null,
      assetId: 'a-btc',
      quantity: 10_000_000,
    };

    const result = vndTotal([wallet], [buyAll]);
    expect(result.perCurrency).toEqual([{ currency: 'USD', balance: 0 }]);
    expect(result.totalVnd).toBe(2_500_000);
    expect(result.approximate).toBe(true);
  });

  it('keeps approximate=false when a non-VND wallet has 0 cash and no remaining holdings', () => {
    const wallet: CalcWallet = {
      id: 'w-usd-inv',
      currency: 'USD',
      startAmount: 0,
      startDate: '2026-11-01',
      startCostVnd: null,
      archived: false,
    };

    const result = vndTotal([wallet], []);
    expect(result.approximate).toBe(false);
  });
});
