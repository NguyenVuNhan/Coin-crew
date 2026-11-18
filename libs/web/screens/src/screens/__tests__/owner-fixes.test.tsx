import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AssetView, HoldingView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { mockApi, renderAt } from '../../test/render';
import { finishAmount } from '../../test/entry';
import { AddMenu } from '../../components/AddMenu';
import { EntryPage } from '../EntryPage';
import { SpendingBook } from '../SpendingBook';
import { WalletScreen } from '../WalletScreen';
import { WalletsScreen } from '../WalletsScreen';

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

const btcLotAsset: AssetView = {
  id: 'a-btc',
  name: 'BTC',
  unit: '',
  groupName: 'Crypto',
  decimals: 4,
  hidden: false,
  sortOrder: 0,
  entryCount: 1,
};

const usdtWalletPos: WalletDetailView = {
  id: 'w-usdt',
  name: 'Binance',
  kind: 'investment',
  currency: 'USDT',
  balance: 100_000, // 1.000,00 USDT
  startAmount: 200_000,
  startDate: '2026-11-01',
  startCostVnd: 50_000_000,
  vndValue: 50_000_000,
  icon: 'bg-avatar-1',
  sortOrder: 0,
  archived: false,
  isDefault: false,
  entryCount: 1,
};

describe('Owner review fixes (PR #131)', () => {
  it('shows "~" average price, grey cash slice + cash row, and no start date on WalletScreen', async () => {
    const holdings: HoldingView[] = [
      { walletId: 'w-usdt', assetId: 'a-btc', quantity: 1, cost: 100_000, costVnd: 25_000_000 },
    ];

    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/ledger': { ledger: null },
      'GET /api/me/personal/wallets': { wallets: [usdtWalletPos] },
      'GET /api/me/personal/categories': { categories: [], recentIds: [] },
      'GET /api/me/personal/assets': { assets: [btcLotAsset] },
      'GET /api/me/personal/holdings': { holdings },
      'GET /api/me/personal/transactions': { rows: [], totals: [] },
    });

    const first = renderAt(<WalletScreen />, {
      route: '/wallets/w-usdt',
      path: '/wallets/:id',
    });
    act(() => setLang('vi'));

    const list = await screen.findByTestId('wallet-holdings-list');
    // 1. No start date on summary
    expect(screen.getByTestId('wallet-summary')).not.toHaveTextContent('Bắt đầu từ');
    // 2. "~" average price for 1 lot of 0.0001 BTC at 1.000 USDT -> ~10.000.000,00 USDT/BTC
    const btcRow = within(list).getByTestId('wallet-holding-a-btc');
    expect(btcRow).toHaveTextContent('0,0001 BTC · ~10.000.000,00 USDT/BTC');
    expect(btcRow).toHaveTextContent('50%');

    // 3. Grey cash slice & cash row with %
    const arc = screen.getByTestId('wallet-holdings-arc');
    const slices = within(arc).getAllByTestId('wallet-holdings-arc-slice');
    expect(slices).toHaveLength(2);
    expect(slices[1]).toHaveClass('fill-muted-foreground/30');
    const card = screen.getByTestId('wallet-holdings-card');
    expect(card).toHaveTextContent('2.000,00 USDT');
    expect(card).toHaveTextContent('Tổng · 1 tài sản + tiền mặt');
    const cashRow = within(list).getByTestId('wallet-holding-cash');
    expect(cashRow).toHaveTextContent('Tiền mặt');
    expect(cashRow).toHaveTextContent('1.000,00 USDT');
    expect(cashRow).toHaveTextContent('50%');
    first.unmount();

    // Negative cash: no cash slice, lower centre total, cash row without %
    const negWallet: WalletDetailView = { ...usdtWalletPos, balance: -40_000 }; // -400,00 USDT
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/ledger': { ledger: null },
      'GET /api/me/personal/wallets': { wallets: [negWallet] },
      'GET /api/me/personal/categories': { categories: [], recentIds: [] },
      'GET /api/me/personal/assets': { assets: [btcLotAsset] },
      'GET /api/me/personal/holdings': { holdings },
      'GET /api/me/personal/transactions': { rows: [], totals: [] },
    });

    renderAt(<WalletScreen />, {
      route: '/wallets/w-usdt',
      path: '/wallets/:id',
    });
    act(() => setLang('vi'));

    const negList = await screen.findByTestId('wallet-holdings-list');
    expect(screen.getAllByTestId('wallet-holdings-arc-slice')).toHaveLength(1);
    expect(screen.getByTestId('wallet-holdings-card')).toHaveTextContent('600,00 USDT');
    const negCashRow = within(negList).getByTestId('wallet-holding-cash');
    expect(negCashRow).toHaveTextContent('-400,00 USDT');
    expect(negCashRow).not.toHaveTextContent('%');
  });

  it('lot asset in EntryPage: typing 1 sends quantity 1, shows "× 0.0001 BTC" and "= 0,0001 BTC"', async () => {
    const user = userEvent.setup();
    const vndInvWallet: WalletDetailView = {
      ...usdtWalletPos,
      id: 'w-vnd-inv',
      name: 'Đầu tư VND',
      currency: 'VND',
      balance: 50_000_000,
      startAmount: 50_000_000,
      startCostVnd: null,
      vndValue: 50_000_000,
    };
    const { calls } = mockApi({
      'GET /api/me': meOn,
      'GET /api/me/ledger': { ledger: null },
      'GET /api/me/personal/wallets': { wallets: [vndInvWallet] },
      'GET /api/me/personal/categories': { categories: [], recentIds: [] },
      'GET /api/me/personal/assets': { assets: [btcLotAsset] },
      'GET /api/me/personal/holdings': { holdings: [] },
      'GET /api/me/people/candidates': [],
      'POST /api/me/personal/transactions': {
        entries: [
          {
            id: 'e-1',
            walletId: 'w-vnd-inv',
            type: 'buy',
            amount: -25_000_000,
            currency: 'VND',
            categoryId: null,
            assetId: 'a-btc',
            quantity: 1,
            date: '2026-11-18',
            time: null,
            note: null,
            tags: [],
            excludeFromReports: false,
            source: 'manual',
            tripId: null,
            transferId: null,
            beforeStart: false,
            createdAt: '2026-11-18T00:00:00.000Z',
          },
        ],
      },
    });

    renderAt(<EntryPage />, {
      route: '/entries/new?type=expense&tile=buy&wallet=w-vnd-inv',
      path: '/entries/new',
    });
    act(() => setLang('vi'));

    await finishAmount(user, '25000000');
    await waitFor(() => expect(screen.getByTestId('entry-asset-row')).toBeInTheDocument());

    await user.click(screen.getByTestId('entry-asset-row'));
    await user.click(await screen.findByText('BTC'));

    expect(screen.getByTestId('entry-quantity-unit')).toHaveTextContent('× 0.0001 BTC');
    expect(screen.getByTestId('entry-quantity')).toHaveAttribute('inputmode', 'numeric');

    await user.type(screen.getByTestId('entry-quantity'), '1');
    expect(screen.getByTestId('entry-quantity-total')).toHaveTextContent('= 0,0001 BTC');

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.path === '/api/me/personal/transactions')).toBe(true),
    );
    const post = calls.find((c) => c.method === 'POST' && c.path === '/api/me/personal/transactions');
    expect(post?.body).toMatchObject({
      type: 'buy',
      assetId: 'a-btc',
      quantity: 1,
    });
  });

  it('AddMenu does not render Mua / bán tài sản', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/wallets': { wallets: [usdtWalletPos] },
    });

    renderAt(<AddMenu addHref="/entries/new" align="end" side="top" variant="fab" />, {
      route: '/wallets',
    });
    act(() => setLang('vi'));

    await user.click(screen.getByTestId('nav-add'));
    expect(await screen.findByTestId('add-menu-expense')).toBeInTheDocument();
    expect(screen.queryByTestId('add-menu-buy-sell')).toBeNull();
  });

  it('WalletsScreen and SpendingBook show cashVnd as big total and "Tổng gồm tài sản" below it', async () => {
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/ledger': { ledger: null },
      'GET /api/me/personal/wallets': { wallets: [usdtWalletPos] },
      'GET /api/me/personal/categories': { categories: [], recentIds: [] },
      'GET /api/me/personal/assets': { assets: [btcLotAsset] },
      'GET /api/me/personal/transactions': { rows: [], totals: [] },
      'GET /api/me/personal/summary': {
        totalVnd: 250_000,
        cashVnd: -24_750_000,
        approximate: true,
        perCurrency: [{ currency: 'USDT', balance: -99_000 }],
        unratedWalletIds: [],
        month: '2026-11',
        spent: [],
        income: [],
      },
    });

    const first = renderAt(<WalletsScreen />, { route: '/wallets' });
    act(() => setLang('vi'));

    const card = await screen.findByTestId('wallets-total');
    await waitFor(() => expect(card).toHaveTextContent('-24.750.000₫'));
    expect(within(card).getByTestId('wallets-total-with-assets')).toHaveTextContent(
      'Tổng gồm tài sản ≈ 250.000₫',
    );
    first.unmount();

    renderAt(<SpendingBook />, { route: '/' });
    act(() => setLang('vi'));

    const bookCard = await screen.findByTestId('book-total');
    await waitFor(() => expect(bookCard).toHaveTextContent('-24.750.000₫'));
    expect(within(bookCard).getByTestId('wallets-total-with-assets')).toHaveTextContent(
      'Tổng gồm tài sản ≈ 250.000₫',
    );
  });
});
