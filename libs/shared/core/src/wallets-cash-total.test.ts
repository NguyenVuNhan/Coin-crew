import { describe, expect, it } from 'vitest';
import { vndTotal, type CalcEntry, type CalcWallet } from './wallets';

describe('vndTotal cashVnd vs totalVnd', () => {
  it('goes negative for -990 USDT after buying 1.000 USDT of BTC while totalVnd stays 250.000', () => {
    const vndWallet: CalcWallet = {
      id: 'w-vnd',
      currency: 'VND',
      startAmount: 1_000_000,
      startDate: '2026-11-01',
      startCostVnd: null,
      archived: false,
    };
    const usdtWallet: CalcWallet = {
      id: 'w-usdt',
      currency: 'USDT',
      startAmount: 0,
      startDate: '2026-11-01',
      startCostVnd: null,
      archived: false,
    };

    const entries: CalcEntry[] = [
      {
        id: 'e-t-out',
        walletId: 'w-vnd',
        type: 'transfer_out',
        amount: 250_000,
        date: '2026-11-02',
        time: null,
        createdAt: '2026-11-02T00:00:00.000Z',
        transferId: 't-1',
        assetId: null,
        quantity: null,
        excludeFromReports: false,
      },
      {
        id: 'e-t-in',
        walletId: 'w-usdt',
        type: 'transfer_in',
        amount: 1_000, // 10 USDT
        date: '2026-11-02',
        time: null,
        createdAt: '2026-11-02T00:00:00.000Z',
        transferId: 't-1',
        assetId: null,
        quantity: null,
        excludeFromReports: false,
      },
      {
        id: 'e-buy',
        walletId: 'w-usdt',
        type: 'buy',
        amount: 100_000, // 1.000 USDT
        date: '2026-11-03',
        time: null,
        createdAt: '2026-11-03T00:00:00.000Z',
        transferId: null,
        assetId: 'a-btc',
        quantity: 1,
        excludeFromReports: false,
      },
    ];

    const result = vndTotal([usdtWallet, vndWallet], entries);
    expect(result.cashVnd).toBe(-24_000_000);
    expect(result.totalVnd).toBe(1_000_000);

    const usdtOnly = vndTotal([usdtWallet, { ...vndWallet, archived: true }], entries);
    expect(usdtOnly.cashVnd).toBe(-24_750_000);
    expect(usdtOnly.totalVnd).toBe(250_000);
  });

  it('equals balance sum for VND wallets even with holdings', () => {
    const vndDay: CalcWallet = {
      id: 'w-day',
      currency: 'VND',
      startAmount: 2_000_000,
      startDate: '2026-11-01',
      startCostVnd: null,
      archived: false,
    };
    const vndInv: CalcWallet = {
      id: 'w-inv',
      currency: 'VND',
      startAmount: 5_000_000,
      startDate: '2026-11-01',
      startCostVnd: null,
      archived: false,
    };
    const entries: CalcEntry[] = [
      {
        id: 'e-buy',
        walletId: 'w-inv',
        type: 'buy',
        amount: 3_000_000,
        date: '2026-11-02',
        time: null,
        createdAt: '2026-11-02T00:00:00.000Z',
        transferId: null,
        assetId: 'a-etf',
        quantity: 100,
        excludeFromReports: false,
      },
    ];

    const result = vndTotal([vndDay, vndInv], entries);
    expect(result.cashVnd).toBe(4_000_000); // 2.000.000 + (5.000.000 - 3.000.000)
    expect(result.totalVnd).toBe(7_000_000); // 4.000.000 + 3.000.000 holdings

    // Without holdings, cashVnd equals totalVnd and is omitted
    const noHoldings = vndTotal([vndDay, vndInv], []);
    expect(noHoldings.totalVnd).toBe(7_000_000);
    expect(noHoldings.cashVnd).toBeUndefined();
  });
});
