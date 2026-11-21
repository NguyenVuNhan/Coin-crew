import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AssetView, CategoryView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt, mockApi } from '../../../test/render';
import { WalletScreen } from '../../../screens/WalletScreen';
import { WalletVisibilitySheet } from '../WalletVisibilitySheet';
import { ItemWalletsRow } from '../ItemWalletsRow';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const meOn = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: true,
};

const ledger = { tripId: 't-led', ownerPid: 'p-me' };

function makeWallet(overrides: Partial<WalletDetailView> & { id: string; name: string }): WalletDetailView {
  return {
    currency: 'VND',
    balance: 1000000,
    isDefault: false,
    kind: 'everyday',
    startAmount: 1000000,
    startDate: '2026-01-01',
    startCostVnd: null,
    vndValue: 1000000,
    icon: null,
    sortOrder: 0,
    archived: false,
    entryCount: 0,
    ...overrides,
  };
}

const binance = makeWallet({ id: 'w-binance', name: 'Binance', kind: 'investment', sortOrder: 0 });
const mb = makeWallet({ id: 'w-mb', name: 'MB', kind: 'everyday', sortOrder: 1, isDefault: true });
const cash = makeWallet({ id: 'w-cash', name: 'Tiền mặt', kind: 'everyday', sortOrder: 2 });
const vcb = makeWallet({ id: 'w-vcb', name: 'VCB', kind: 'everyday', sortOrder: 3 });
const archivedWallet = makeWallet({ id: 'w-old', name: 'Ví cũ', kind: 'everyday', sortOrder: 4, archived: true });

function makeCat(
  overrides: Partial<CategoryView> & { id: string; name: string },
): CategoryView {
  return {
    parentId: null,
    type: 'expense',
    icon: 'receipt',
    hidden: false,
    sortOrder: 0,
    starterKey: null,
    walletOverrides: [],
    ...overrides,
  };
}

function makeAsset(
  overrides: Partial<AssetView> & { id: string; name: string; groupName: string },
): AssetView {
  return {
    unit: 'unit',
    decimals: 4,
    hidden: false,
    sortOrder: 0,
    entryCount: 0,
    walletOverrides: [],
    ...overrides,
  };
}

const baseCategories: CategoryView[] = [
  makeCat({ id: 'food', name: 'Ăn uống', icon: 'utensils', starterKey: 'food', sortOrder: 0 }),
  makeCat({ id: 'fees', name: 'Phí & lệ phí', icon: 'receipt', starterKey: 'fees', sortOrder: 1 }),
  makeCat({ id: 'tax', name: 'Thuế', parentId: 'fees', icon: 'landmark', starterKey: 'tax', sortOrder: 0 }),
  makeCat({ id: 'fee', name: 'Phí', parentId: 'fees', icon: 'receipt', starterKey: 'fee', sortOrder: 1 }),
  makeCat({ id: 'hidden-cat', name: 'Danh mục ẩn', hidden: true, sortOrder: 2 }),
  makeCat({ id: 'salary', name: 'Lương', type: 'income', icon: 'wallet', starterKey: 'salary', sortOrder: 0 }),
];

const baseAssets: AssetView[] = [
  makeAsset({ id: 'a-btc', name: 'Bitcoin', unit: 'BTC', groupName: 'Crypto', sortOrder: 0 }),
  makeAsset({ id: 'a-eth', name: 'Ethereum', unit: 'ETH', groupName: 'Crypto', sortOrder: 1 }),
  makeAsset({ id: 'a-hidden', name: 'Old Coin', unit: 'OLD', groupName: 'Crypto', hidden: true, sortOrder: 2 }),
  makeAsset({ id: 'a-etf', name: 'FUEVFVND', unit: 'ccq', groupName: 'ETF', sortOrder: 3 }),
];

describe('WalletVisibilitySheet & ItemWalletsRow', () => {
  it('opens WalletVisibilitySheet from the wallet screen menu', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/ledger': ledger,
      'GET /api/me/personal/wallets': { wallets: [binance, mb] },
      'GET /api/me/personal/categories': { categories: baseCategories, recentIds: [] },
      'GET /api/me/personal/assets': { assets: baseAssets },
      'GET /api/me/personal/holdings': { holdings: [] },
      'GET /api/me/personal/transactions': { rows: [], totals: [] },
    });

    renderAt(<WalletScreen />, { route: '/wallets/w-binance', path: '/wallets/:id' });

    const menuBtn = await screen.findByTestId('wallet-menu-btn');
    await user.click(menuBtn);

    const visMenuItem = await screen.findByTestId('wallet-menu-visibility');
    await user.click(visMenuItem);

    expect(await screen.findByTestId('wallet-visibility-sheet')).toBeInTheDocument();
  });

  it('shows investment defaults (food off, fees on), omits hidden items, and labels switches with item names', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/personal/categories': { categories: baseCategories, recentIds: [] },
      'GET /api/me/personal/assets': { assets: baseAssets },
    });

    renderAt(
      <WalletVisibilitySheet open onClose={() => {}} wallet={binance} />,
    );

    const foodSwitch = await screen.findByTestId('vis-cat-food');
    const feesSwitch = screen.getByTestId('vis-cat-fees');

    expect(foodSwitch).toHaveAttribute('aria-checked', 'false');
    expect(feesSwitch).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByTestId('vis-cat-hidden-cat')).not.toBeInTheDocument();
    expect(screen.queryByTestId('vis-asset-a-hidden')).not.toBeInTheDocument();

    expect(screen.getByRole('switch', { name: 'Ăn uống' })).toBe(foodSwitch);
    expect(screen.getByRole('switch', { name: 'Phí & lệ phí' })).toBe(feesSwitch);
    expect(screen.getByRole('switch', { name: 'Crypto' })).toBe(
      screen.getByTestId('vis-asset-group-Crypto'),
    );

    await user.click(screen.getByTestId('vis-cat-expand-fees'));
    expect(screen.getByRole('switch', { name: 'Thuế' })).toBe(screen.getByTestId('vis-cat-tax'));

    await user.click(screen.getByTestId('vis-asset-expand-Crypto'));
    expect(screen.getByRole('switch', { name: 'Bitcoin' })).toBe(
      screen.getByTestId('vis-asset-a-btc'),
    );
  });

  it('toggling vis-cat-fees off writes fees, tax and fee all visible:false in one call', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/me/personal/categories': { categories: baseCategories, recentIds: [] },
      'GET /api/me/personal/assets': { assets: baseAssets },
      'PUT /api/me/personal/wallets/w-binance/visibility': { ok: true },
    });

    renderAt(
      <WalletVisibilitySheet open onClose={() => {}} wallet={binance} />,
    );

    const feesSwitch = await screen.findByTestId('vis-cat-fees');
    await user.click(feesSwitch);

    await waitFor(() => {
      const put = calls.find(
        (c) => c.method === 'PUT' && c.path === '/api/me/personal/wallets/w-binance/visibility',
      );
      expect(put?.body).toEqual({
        categories: [
          { id: 'fees', visible: false },
          { id: 'tax', visible: false },
          { id: 'fee', visible: false },
        ],
      });
    });
  });

  it('shows 1/2 next to vis-cat-fees when one sub has an override back on', async () => {
    const mixedCategories: CategoryView[] = [
      makeCat({
        id: 'fees',
        name: 'Phí & lệ phí',
        icon: 'receipt',
        starterKey: 'fees',
        sortOrder: 0,
        walletOverrides: [{ walletId: 'w-binance', visible: false }],
      }),
      makeCat({
        id: 'tax',
        name: 'Thuế',
        parentId: 'fees',
        icon: 'landmark',
        starterKey: 'tax',
        sortOrder: 0,
        walletOverrides: [{ walletId: 'w-binance', visible: true }],
      }),
      makeCat({
        id: 'fee',
        name: 'Phí',
        parentId: 'fees',
        icon: 'receipt',
        starterKey: 'fee',
        sortOrder: 1,
        walletOverrides: [{ walletId: 'w-binance', visible: false }],
      }),
    ];

    mockApi({
      'GET /api/me/personal/categories': { categories: mixedCategories, recentIds: [] },
      'GET /api/me/personal/assets': { assets: [] },
    });

    renderAt(
      <WalletVisibilitySheet open onClose={() => {}} wallet={binance} />,
    );

    const feesSwitch = await screen.findByTestId('vis-cat-fees');
    expect(feesSwitch).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('toggling the Crypto group switch writes every non-hidden Crypto asset', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/me/personal/categories': { categories: baseCategories, recentIds: [] },
      'GET /api/me/personal/assets': { assets: baseAssets },
      'PUT /api/me/personal/wallets/w-binance/visibility': { ok: true },
    });

    renderAt(
      <WalletVisibilitySheet open onClose={() => {}} wallet={binance} />,
    );

    const cryptoSwitch = await screen.findByTestId('vis-asset-group-Crypto');
    expect(cryptoSwitch).toHaveAttribute('aria-checked', 'true');
    await user.click(cryptoSwitch);

    await waitFor(() => {
      const put = calls.find(
        (c) => c.method === 'PUT' && c.path === '/api/me/personal/wallets/w-binance/visibility',
      );
      expect(put?.body).toEqual({
        assets: [
          { id: 'a-btc', visible: false },
          { id: 'a-eth', visible: false },
        ],
      });
    });
  });

  it('rolls back and shows Snackbar when visibility PUT fails', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/personal/categories': { categories: baseCategories, recentIds: [] },
      'GET /api/me/personal/assets': { assets: baseAssets },
      'PUT /api/me/personal/wallets/w-binance/visibility': () =>
        Response.json({ error: { code: 'SERVER', message: 'Failed' } }, { status: 500 }),
    });

    renderAt(
      <WalletVisibilitySheet open onClose={() => {}} wallet={binance} />,
    );

    const feesSwitch = await screen.findByTestId('vis-cat-fees');
    expect(feesSwitch).toHaveAttribute('aria-checked', 'true');
    await user.click(feesSwitch);

    expect(await screen.findByRole('status')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('vis-cat-fees')).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('ItemWalletsRow shows "Chỉ Binance" for one visible wallet, hides archived wallets, and saves ticked ids', async () => {
    const user = userEvent.setup();
    const feesOnlyBinance = makeCat({
      id: 'fees',
      name: 'Phí & lệ phí',
      starterKey: 'fees',
      walletOverrides: [
        { walletId: 'w-binance', visible: true },
        { walletId: 'w-mb', visible: false },
        { walletId: 'w-cash', visible: false },
        { walletId: 'w-vcb', visible: false },
      ],
    });

    const { calls } = mockApi({
      'GET /api/me/personal/wallets': { wallets: [binance, mb, cash, vcb, archivedWallet] },
      'GET /api/me/personal/categories': { categories: [feesOnlyBinance], recentIds: [] },
      'PUT /api/me/personal/categories/fees/wallets': { ok: true },
    });

    renderAt(<ItemWalletsRow kind="category" item={feesOnlyBinance} />);
    setLang('vi');

    const row = await screen.findByTestId('item-wallets-row');
    await waitFor(() => {
      expect(row).toHaveTextContent('Chỉ Binance');
    });

    await user.click(row);

    expect(await screen.findByTestId('item-wallet-option-w-binance')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('item-wallet-option-w-mb')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('item-wallet-option-w-old')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('item-wallet-option-w-mb'));
    await user.click(screen.getByTestId('item-wallets-save-btn'));

    await waitFor(() => {
      const put = calls.find(
        (c) => c.method === 'PUT' && c.path === '/api/me/personal/categories/fees/wallets',
      );
      expect(put?.body).toEqual({ walletIds: ['w-binance', 'w-mb'] });
    });
  });

  it('ItemWalletsRow formats all, two, three+, and none summaries and saves asset wallets', async () => {
    const user = userEvent.setup();
    const btcTwoWallets = makeAsset({
      id: 'a-btc',
      name: 'Bitcoin',
      groupName: 'Crypto',
      walletOverrides: [
        { walletId: 'w-cash', visible: false },
        { walletId: 'w-vcb', visible: false },
      ],
    });

    const { calls } = mockApi({
      'GET /api/me/personal/wallets': { wallets: [binance, mb, cash, vcb] },
      'GET /api/me/personal/assets': { assets: [btcTwoWallets] },
      'PUT /api/me/personal/assets/a-btc/wallets': { ok: true },
    });

    renderAt(<ItemWalletsRow kind="asset" item={btcTwoWallets} />);
    setLang('vi');

    const row = await screen.findByTestId('item-wallets-row');
    await waitFor(() => {
      expect(row).toHaveTextContent('Binance, MB');
    });

    await user.click(row);
    await user.click(await screen.findByTestId('item-wallet-option-w-cash'));
    await user.click(screen.getByTestId('item-wallets-save-btn'));

    await waitFor(() => {
      const put = calls.find(
        (c) => c.method === 'PUT' && c.path === '/api/me/personal/assets/a-btc/wallets',
      );
      expect(put?.body).toEqual({ walletIds: ['w-binance', 'w-mb', 'w-cash'] });
    });
  });
});
