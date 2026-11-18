import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type {
  AssetView,
  CategoriesResponse,
  CategoryView,
  EntryView,
  HoldingView,
  ListRow,
  WalletDetailView,
} from '@cc/core';
import { setLang, t } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { ApiClientError } from '@cc/web-data-access/client';
import { mockApi } from '../../test/render';
import { NavHistoryProvider } from '../../lib/navHistory';
import { EntryPage } from '../EntryPage';
import { WalletScreen } from '../WalletScreen';
import { TransactionsScreen } from '../TransactionsScreen';
import { CategoryPicker } from '../../components/CategoryPicker';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';

async function tapKeypadDigits(user: ReturnType<typeof userEvent.setup>, digits: string) {
  for (const ch of digits) {
    await user.click(screen.getByTestId(`key-${ch}`));
  }
}

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  setLang('vi', false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
});

const invWalletVnd: WalletDetailView = {
  id: 'w-inv',
  name: 'Binance',
  currency: 'VND',
  balance: 50_000_000,
  isDefault: true,
  kind: 'investment',
  startAmount: 50_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 50_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 1,
};

const invWalletUsd: WalletDetailView = {
  id: 'w-usd-inv',
  name: 'IBKR',
  currency: 'USD',
  balance: 100_00,
  isDefault: false,
  kind: 'investment',
  startAmount: 100_00,
  startDate: '2026-01-01',
  startCostVnd: 2_500_000,
  vndValue: 3_000_000,
  icon: null,
  sortOrder: 1,
  archived: false,
  entryCount: 1,
};

const categoriesList: CategoryView[] = [
  { id: 'c-food', type: 'expense', name: 'Ăn uống', icon: 'utensils', parentId: null, hidden: false, sortOrder: 0 },
  { id: 'c-shop', type: 'expense', name: 'Mua sắm', icon: 'shopping-bag', parentId: null, hidden: false, sortOrder: 1 },
  { id: 'c-bill', type: 'expense', name: 'Hóa đơn', icon: 'receipt', parentId: null, hidden: false, sortOrder: 2 },
  { id: 'c-move', type: 'expense', name: 'Di chuyển', icon: 'car', parentId: null, hidden: false, sortOrder: 3 },
  { id: 'c-fun', type: 'expense', name: 'Giải trí', icon: 'gamepad', parentId: null, hidden: false, sortOrder: 4 },
  { id: 'c-health', type: 'expense', name: 'Sức khỏe', icon: 'heart', parentId: null, hidden: false, sortOrder: 5 },
];

const categoriesResp: CategoriesResponse = {
  categories: categoriesList,
  recentIds: [],
};

const btcAsset: AssetView = {
  id: 'a-btc',
  name: 'Bitcoin',
  unit: 'BTC',
  groupName: 'Crypto',
  decimals: 8,
  hidden: false,
  sortOrder: 0,
  entryCount: 1,
};

function renderWithRouter(ui: React.ReactElement, initialPath: string, routePath: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PlatformProvider platform={browserPlatform}>
        <MemoryRouter initialEntries={[initialPath]}>
          <NavHistoryProvider>
            <UndoSnackbarHost />
            <Routes>
              <Route path={routePath} element={ui} />
              <Route path="*" element={<div>navigated</div>} />
            </Routes>
          </NavHistoryProvider>
        </MemoryRouter>
      </PlatformProvider>
    </QueryClientProvider>,
  );
}

describe('I1: editing must not switch between trade and non-trade', () => {
  it('disables category tiles, transfer tile, and Thêm when editing a trade', async () => {
    const buyEntry: EntryView = {
      id: 'e-buy-1',
      type: 'buy',
      walletId: 'w-inv',
      amount: 10_000_000,
      currency: 'VND',
      categoryId: null,
      assetId: 'a-btc',
      quantity: 10_000_000,
      date: '2026-11-17',
      time: '09:00',
      note: null,
      excludeFromReports: true,
      transferId: null,
      counterpartWalletId: null,
      tags: [],
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-17T09:00:00.000Z',
    };

    mockApi({
      'GET /api/me/personal/wallets': { wallets: [invWalletVnd] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/tags': { tags: [] },
      'GET /api/me/personal/assets': { assets: [btcAsset] },
      'GET /api/me/personal/transactions': { rows: [{ kind: 'entry', entry: buyEntry }], totals: [] },
      'GET /api/me/personal/holdings': { holdings: [] },
    });

    renderWithRouter(<EntryPage />, '/entries/e-buy-1/edit', '/entries/:id/edit');

    await waitFor(() => {
      expect(screen.getByTestId('category-tile-buy')).toHaveAttribute('aria-pressed', 'true');
    });

    expect(screen.getByTestId('category-tile-transfer')).toBeDisabled();
    expect(screen.getByTestId('category-tile-transfer')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('category-tile-c-food')).toBeDisabled();
    expect(screen.getByTestId('category-tile-c-food')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('category-more')).toBeDisabled();
    expect(screen.getByTestId('category-more')).toHaveAttribute('aria-disabled', 'true');
  });

  it('hides the trade tile when editing a non-trade entry on an investment wallet', async () => {
    const expenseEntry: EntryView = {
      id: 'e-exp-1',
      type: 'expense',
      walletId: 'w-inv',
      amount: 50_000,
      currency: 'VND',
      categoryId: 'c-food',
      assetId: null,
      quantity: null,
      date: '2026-11-17',
      time: '09:00',
      note: null,
      excludeFromReports: false,
      transferId: null,
      counterpartWalletId: null,
      tags: [],
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-17T09:00:00.000Z',
    };

    mockApi({
      'GET /api/me/personal/wallets': { wallets: [invWalletVnd] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/tags': { tags: [] },
      'GET /api/me/personal/assets': { assets: [btcAsset] },
      'GET /api/me/personal/transactions': { rows: [{ kind: 'entry', entry: expenseEntry }], totals: [] },
      'GET /api/me/personal/holdings': { holdings: [] },
    });

    renderWithRouter(<EntryPage />, '/entries/e-exp-1/edit', '/entries/:id/edit');

    await waitFor(() => {
      expect(screen.getByTestId('category-tile-c-food')).toHaveAttribute('aria-pressed', 'true');
    });

    expect(screen.queryByTestId('category-tile-buy')).not.toBeInTheDocument();
    expect(screen.queryByTestId('category-tile-sell')).not.toBeInTheDocument();
  });
});

describe('I2: fractional quantity accepts "." on decimal pad', () => {
  it('typing "0.5" for an 8-decimal asset posts quantity 50000000', async () => {
    const postedBodies: Record<string, unknown>[] = [];

    mockApi({
      'GET /api/me/personal/wallets': { wallets: [invWalletVnd] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/tags': { tags: [] },
      'GET /api/me/personal/assets': { assets: [btcAsset] },
      'GET /api/me/personal/holdings': { holdings: [] },
      'POST /api/me/personal/transactions': (init: RequestInit | undefined) => {
        postedBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return {
          entries: [
            {
              id: 'e-new',
              type: 'buy',
              walletId: 'w-inv',
              amount: 100_000,
              currency: 'VND',
              categoryId: null,
              assetId: 'a-btc',
              quantity: 50_000_000,
              date: '2026-11-17',
              time: '09:00',
              note: null,
              excludeFromReports: true,
              transferId: null,
              counterpartWalletId: null,
              tags: [],
              source: 'manual',
              beforeStart: false,
              createdAt: '2026-11-17T09:00:00.000Z',
            },
          ],
        };
      },
    });

    const user = userEvent.setup();
    renderWithRouter(<EntryPage />, '/entries/new', '/entries/new');

    await waitFor(() => {
      expect(screen.getByTestId('category-tile-buy')).toBeInTheDocument();
    });

    await tapKeypadDigits(user, '100000');
    await user.click(screen.getByTestId('key-done'));

    await user.click(screen.getByTestId('category-tile-buy'));
    await user.click(screen.getByTestId('entry-asset-row'));
    await user.click(await screen.findByTestId('asset-option-a-btc'));

    const qtyInput = screen.getByTestId('entry-quantity');
    await user.type(qtyInput, '0.5');
    expect(qtyInput).toHaveValue('0,5');

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(postedBodies).toHaveLength(1);
    });
    expect(postedBodies[0]?.quantity).toBe(50_000_000);
  });
});

describe('I3: WalletScreen totalCostBasis when investment wallet has holdings', () => {
  it('uses wallet.totalCostBasis when investment wallet has holdings, and wallet.costBasis when empty', async () => {
    const holdings: HoldingView[] = [
      {
        walletId: 'w-usd-inv',
        assetId: 'a-btc',
        quantity: 50_000_000,
        cost: 50_000,
        costVnd: 1_250_000,
      },
    ];

    mockApi({
      'GET /api/me/personal/wallets': { wallets: [invWalletUsd] },
      'GET /api/me/personal/holdings': { holdings },
      'GET /api/me/personal/transactions': { rows: [], totals: [] },
    });

    const { unmount } = renderWithRouter(
      <WalletScreen />,
      '/me/personal/wallets/w-usd-inv',
      '/me/personal/wallets/:id',
    );

    await waitFor(() => {
      expect(screen.getByTestId('wallet-cost-basis')).toHaveTextContent('tổng giá vốn (gồm tài sản) ≈');
    });
    unmount();

    mockApi({
      'GET /api/me/personal/wallets': { wallets: [invWalletUsd] },
      'GET /api/me/personal/holdings': { holdings: [] },
      'GET /api/me/personal/transactions': { rows: [], totals: [] },
    });

    renderWithRouter(
      <WalletScreen />,
      '/me/personal/wallets/w-usd-inv',
      '/me/personal/wallets/:id',
    );

    await waitFor(() => {
      expect(screen.getByTestId('wallet-cost-basis')).toHaveTextContent('giá vốn ≈');
    });
    expect(screen.getByTestId('wallet-cost-basis')).not.toHaveTextContent('gồm tài sản');
  });
});

describe('I4: TransactionsScreen by-category grouping for trades', () => {
  it('groups buy/sell trades under transactions.typeTrade instead of Other', async () => {
    const tradeRow: ListRow = {
      kind: 'entry',
      entry: {
        id: 'e-trade-1',
        type: 'buy',
        walletId: 'w-inv',
        amount: 1_000_000,
        currency: 'VND',
        categoryId: null,
        assetId: 'a-btc',
        quantity: 10_000_000,
        date: '2026-11-17',
        time: '09:00',
        note: null,
        excludeFromReports: true,
        transferId: null,
        counterpartWalletId: null,
        tags: [],
        source: 'manual',
        beforeStart: false,
        createdAt: '2026-11-17T09:00:00.000Z',
      },
    };

    mockApi({
      'GET /api/me/personal/wallets': { wallets: [invWalletVnd] },
      'GET /api/me/personal/assets': { assets: [btcAsset] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/tags': { tags: [] },
      'GET /api/me/personal/transactions': {
        rows: [tradeRow],
        totals: [],
      },
    });

    const user = userEvent.setup();
    renderWithRouter(
      <TransactionsScreen />,
      '/me/personal/transactions',
      '/me/personal/transactions',
    );

    await waitFor(() => {
      expect(screen.getByTestId('tx-view-toggle')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('tx-view-toggle'));

    await waitFor(() => {
      expect(screen.getByText(t('transactions.typeTrade'))).toBeInTheDocument();
    });
    expect(screen.queryByText(t('transactions.otherCategory'))).not.toBeInTheDocument();
  });
});

describe('M3: OVERSELL copy in InlineError and EntryPage', () => {
  it('InlineError formats OVERSELL with details.date as dd/mm/yyyy and drops parentheses without date', () => {
    const qc = new QueryClient();
    const withDate = new ApiClientError('OVERSELL', 422, 'Insufficient asset quantity', {
      code: 'OVERSELL',
      message: 'Insufficient asset quantity',
      details: { assetId: 'a-btc', date: '2026-11-20' },
    });
    const withoutDate = new ApiClientError('OVERSELL', 422, 'Insufficient asset quantity', {
      code: 'OVERSELL',
      message: 'Insufficient asset quantity',
    });

    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <InlineError error={withDate} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Lần bán sau đó sẽ vượt số đang có (20/11/2026)',
    );

    rerender(
      <QueryClientProvider client={qc}>
        <InlineError error={withoutDate} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Lần bán sau đó sẽ vượt số đang có');
    expect(screen.getByRole('alert').textContent).not.toContain('(');
  });

  it('EntryPage keeps personalEntry.oversellError for client oversell and uses error.oversell for server OVERSELL', async () => {
    const holdings: HoldingView[] = [
      {
        walletId: 'w-inv',
        assetId: 'a-btc',
        quantity: 100_000_000,
        cost: 1_000_000,
        costVnd: 1_000_000,
      },
    ];

    mockApi({
      'GET /api/me/personal/wallets': { wallets: [invWalletVnd] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/tags': { tags: [] },
      'GET /api/me/personal/assets': { assets: [btcAsset] },
      'GET /api/me/personal/holdings': { holdings },
      'POST /api/me/personal/transactions': () =>
        Response.json(
          {
            error: {
              code: 'OVERSELL',
              message: 'Insufficient asset quantity',
              details: { assetId: 'a-btc', date: '2026-11-20' },
            },
          },
          { status: 422 },
        ),
    });

    const user = userEvent.setup();
    renderWithRouter(<EntryPage />, '/entries/new', '/entries/new');

    await waitFor(() => {
      expect(screen.getByTestId('entry-tab-income')).toBeInTheDocument();
    });
    await screen.findByTestId('key-1');

    await tapKeypadDigits(user, '100000');
    await user.click(screen.getByTestId('key-done'));

    await user.click(screen.getByTestId('entry-tab-income'));
    await user.click(screen.getByTestId('category-tile-sell'));
    await user.click(screen.getByTestId('entry-asset-row'));
    await user.click(await screen.findByTestId('asset-option-a-btc'));

    const qtyInput = screen.getByTestId('entry-quantity');
    await user.type(qtyInput, '2');
    expect(screen.getByTestId('entry-quantity-error')).toHaveTextContent(
      t('personalEntry.oversellError'),
    );

    await user.clear(qtyInput);
    await user.type(qtyInput, '0,5');
    expect(screen.queryByTestId('entry-quantity-error')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('entry-quantity-error')).toHaveTextContent(
        'Lần bán sau đó sẽ vượt số đang có (20/11/2026)',
      );
    });
  });
});

describe('M4: CategoryPicker caps category tiles at 5 when showTrade is true', () => {
  it('renders 8 tiles total (transfer + trade + 5 categories + more)', () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <CategoryPicker
          type="expense"
          categories={categoriesList}
          recentIds={[]}
          value={null}
          onChange={vi.fn()}
          onSelectTransfer={vi.fn()}
          showTrade
          onTradeSelect={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const grid = screen.getByTestId('category-grid');
    const buttons = within(grid).getAllByRole('button');
    expect(buttons).toHaveLength(8);
  });
});
