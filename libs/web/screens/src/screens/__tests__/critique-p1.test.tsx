import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import type { AssetView, HoldingView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { mockApi, renderAt } from '../../test/render';
import { WalletScreen } from '../WalletScreen';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const meOn = {
  user: { id: 'u-1', email: 'owner@example.com', name: 'Owner', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: true,
};

const btcAsset: AssetView = {
  id: 'a-btc',
  name: 'BTC',
  unit: 'BTC',
  groupName: 'Crypto',
  decimals: 4,
  hidden: false,
  sortOrder: 0,
  entryCount: 1,
};

const etfAsset: AssetView = {
  id: 'a-etf',
  name: 'E1VFVN30',
  unit: 'chỉ',
  groupName: 'ETF',
  decimals: 2,
  hidden: false,
  sortOrder: 1,
  entryCount: 1,
};

const usdtInvestWallet: WalletDetailView = {
  id: 'w-usdt',
  name: 'Binance',
  kind: 'investment',
  currency: 'USDT',
  balance: 50_000,
  startAmount: 100_000,
  startDate: '2026-11-01',
  startCostVnd: null,
  vndValue: 25_000_000,
  icon: 'bg-avatar-1',
  sortOrder: 0,
  archived: false,
  isDefault: false,
  entryCount: 1,
};

const vndInvestWallet: WalletDetailView = {
  id: 'w-vnd-inv',
  name: 'Chứng khoán',
  kind: 'investment',
  currency: 'VND',
  balance: 3_000_000,
  startAmount: 15_000_000,
  startDate: '2026-11-01',
  startCostVnd: null,
  vndValue: 15_000_000,
  icon: 'bg-avatar-2',
  sortOrder: 1,
  archived: false,
  isDefault: false,
  entryCount: 1,
};

describe('Critique P1 fixes', () => {
  it('holdings card: arc of cost shares over the total, then one row per asset with qty · TB price, cost and %', async () => {
    const oneHolding: HoldingView[] = [
      { walletId: 'w-usdt', assetId: 'a-btc', quantity: 300, cost: 30_000, costVnd: 7_500_000 },
    ];

    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/ledger': { ledger: null },
      'GET /api/me/personal/wallets': { wallets: [usdtInvestWallet] },
      'GET /api/me/personal/categories': { categories: [], recentIds: [] },
      'GET /api/me/personal/assets': { assets: [btcAsset, etfAsset] },
      'GET /api/me/personal/holdings': { holdings: oneHolding },
      'GET /api/me/personal/transactions': { rows: [], totals: [] },
    });

    const first = renderAt(<WalletScreen />, {
      route: '/wallets/w-usdt',
      path: '/wallets/:id',
    });
    act(() => setLang('vi'));

    const list = await screen.findByTestId('wallet-holdings-list');
    expect(screen.getAllByTestId('wallet-holdings-arc-slice')).toHaveLength(2);
    const btcRow = within(list).getByTestId('wallet-holding-a-btc');
    expect(btcRow).toHaveTextContent('0,03 BTC · ~10.000,00 USDT/BTC');
    expect(btcRow).toHaveTextContent('300,00 USDT');
    expect(btcRow).toHaveTextContent('38%');
    first.unmount();

    const twoHoldings: HoldingView[] = [
      { walletId: 'w-usdt', assetId: 'a-btc', quantity: 300, cost: 30_000, costVnd: 7_500_000 },
      { walletId: 'w-usdt', assetId: 'a-etf', quantity: 1000, cost: 10_000, costVnd: 2_500_000 },
    ];

    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/ledger': { ledger: null },
      'GET /api/me/personal/wallets': { wallets: [usdtInvestWallet] },
      'GET /api/me/personal/categories': { categories: [], recentIds: [] },
      'GET /api/me/personal/assets': { assets: [btcAsset, etfAsset] },
      'GET /api/me/personal/holdings': { holdings: twoHoldings },
      'GET /api/me/personal/transactions': { rows: [], totals: [] },
    });

    renderAt(<WalletScreen />, {
      route: '/wallets/w-usdt',
      path: '/wallets/:id',
    });
    act(() => setLang('vi'));

    const arc = await screen.findByTestId('wallet-holdings-arc');
    expect(within(arc).getAllByTestId('wallet-holdings-arc-slice')).toHaveLength(3);
    expect(arc).toHaveAttribute('aria-label', 'BTC 33%, E1VFVN30 11%, Tiền mặt 56%');
    const card = screen.getByTestId('wallet-holdings-card');
    expect(card).toHaveTextContent('900,00 USDT');
    expect(card).toHaveTextContent('Tổng · 2 tài sản + tiền mặt');
    const rows = within(screen.getByTestId('wallet-holdings-list'));
    expect(rows.getByTestId('wallet-holding-a-btc')).toHaveTextContent('33%');
    expect(rows.getByTestId('wallet-holding-a-etf')).toHaveTextContent('11%');
    expect(rows.getByTestId('wallet-holding-cash')).toHaveTextContent('56%');
  });

  it('VND investment wallet with holdings shows cash vs total line', async () => {
    const holdings: HoldingView[] = [
      { walletId: 'w-vnd-inv', assetId: 'a-etf', quantity: 1000, cost: 12_000_000, costVnd: 12_000_000 },
    ];

    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/ledger': { ledger: null },
      'GET /api/me/personal/wallets': { wallets: [vndInvestWallet] },
      'GET /api/me/personal/categories': { categories: [], recentIds: [] },
      'GET /api/me/personal/assets': { assets: [etfAsset] },
      'GET /api/me/personal/holdings': { holdings },
      'GET /api/me/personal/transactions': { rows: [], totals: [] },
    });

    renderAt(<WalletScreen />, {
      route: '/wallets/w-vnd-inv',
      path: '/wallets/:id',
    });
    act(() => setLang('vi'));

    await waitFor(() => {
      expect(screen.getByTestId('wallet-cost-basis')).toHaveTextContent(
        'Tiền mặt 3.000.000₫ · Tổng gồm tài sản 15.000.000₫',
      );
    });
  });
});
