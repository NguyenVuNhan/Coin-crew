import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { CategoriesResponse, CategoryView, TripView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { NavHistoryProvider } from '../../lib/navHistory';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';
import { EntryPage } from '../EntryPage';

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  setLang('vi');
  mockMedia();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
});

const vndCash: WalletDetailView = {
  id: 'w-vnd',
  name: 'Tiền mặt',
  currency: 'VND',
  balance: 1_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 1_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 1_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 0,
};

const bankWallet: WalletDetailView = {
  id: 'w-bank',
  name: 'VCB',
  currency: 'VND',
  balance: 5_000_000,
  isDefault: false,
  kind: 'everyday',
  startAmount: 5_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 5_000_000,
  icon: null,
  sortOrder: 1,
  archived: false,
  entryCount: 0,
};

const binanceWallet: WalletDetailView = {
  id: 'w-inv',
  name: 'Binance',
  currency: 'VND',
  balance: 50_000_000,
  isDefault: false,
  kind: 'investment',
  startAmount: 50_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 50_000_000,
  icon: null,
  sortOrder: 2,
  archived: false,
  entryCount: 0,
};

const foodCat: CategoryView = {
  id: 'cat-food',
  type: 'expense',
  name: 'Ăn uống',
  icon: 'utensils',
  parentId: null,
  sortOrder: 0,
  hidden: false,
};

const salaryCat: CategoryView = {
  id: 'cat-salary',
  type: 'income',
  name: 'Lương',
  icon: 'wallet',
  parentId: null,
  sortOrder: 0,
  hidden: false,
};

const categoriesResp: CategoriesResponse = {
  categories: [foodCat, salaryCat],
  recentIds: ['cat-food', 'cat-salary'],
};

function directTripView(): TripView {
  return {
    trip: {
      id: 't-led',
      name: 'Quick expenses',
      currency: 'VND',
      fewestTransfers: true,
      archived: false,
      version: 1,
      total: 0,
      preset: 'direct',
    },
    me: {
      kind: 'member',
      participantId: 'led-o',
      participantPending: false,
      isOrganiser: true,
    },
    people: [{ id: 'led-o', name: 'An', status: 'active', isMember: true, bank: 'none' }],
    balances: { 'led-o': 0 },
    suggestions: [],
    expenses: [],
    payments: [],
    myBalance: null,
    approvals: [],
    links: null,
  };
}

function mockEntryApi(wallets: WalletDetailView[] = [vndCash, bankWallet]) {
  return mockApi({
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
    'GET /api/me/personal/wallets': { wallets },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/assets': { assets: [] },
    'GET /api/me/personal/holdings': { holdings: [] },
    'GET /api/trips/t-led': directTripView(),
    'GET /api/me/people/candidates': [],
  });
}

function renderEntryPage(route: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <PlatformProvider platform={browserPlatform}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/trips', route]} initialIndex={1}>
          <NavHistoryProvider>
            <UndoSnackbarHost />
            <Routes>
              <Route path="/entries/new" element={<EntryPage />} />
              <Route path="/entries/:id/edit" element={<EntryPage />} />
              <Route path="/trips" element={<div data-testid="trips-route">Trips</div>} />
            </Routes>
          </NavHistoryProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

async function enterAmountAndFold(user: ReturnType<typeof userEvent.setup>, digits = '120000') {
  await screen.findByTestId('amount-keypad');
  for (const ch of digits) {
    await user.click(screen.getByTestId(`key-${ch}`));
  }
  await user.click(screen.getByTestId('key-done'));
  await screen.findByTestId('entry-fold-amount');
}

describe('EntryPage — category folding on phones (Task 3)', () => {
  it('shows "Chi cho việc gì?" for expense and "Thu từ đâu?" for income after amount folds', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    const { unmount } = renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user);
    expect(screen.getByText('Chi cho việc gì?')).toBeInTheDocument();
    unmount();

    mockEntryApi();
    renderEntryPage('/entries/new?type=income');
    await enterAmountAndFold(user);
    expect(screen.getByText('Thu từ đâu?')).toBeInTheDocument();
  });

  it('folds category grid into entry-fold-category with "Danh mục", "Ăn uống", and its icon', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user);

    await user.click(screen.getByTestId('category-tile-cat-food'));

    expect(screen.queryByTestId('category-grid')).toBeNull();
    const folded = await screen.findByTestId('entry-fold-category');
    expect(folded).toHaveTextContent('Danh mục');
    expect(folded).toHaveTextContent('Ăn uống');
    const svg = folded.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.classList.contains('lucide-utensils')).toBe(true);
  });

  it('reopens the grid with "Ăn uống" pressed when tapping entry-fold-category', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user);

    await user.click(screen.getByTestId('category-tile-cat-food'));
    const folded = await screen.findByTestId('entry-fold-category');

    await user.click(folded);
    expect(await screen.findByTestId('category-grid')).toBeInTheDocument();
    expect(screen.getByTestId('category-tile-cat-food')).toHaveAttribute('aria-pressed', 'true');
  });

  it('folds transfer tile into "Chuyển sang ví" with wallet rows visible under it', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user);

    await user.click(screen.getByTestId('category-tile-transfer'));

    expect(screen.queryByTestId('category-grid')).toBeNull();
    const folded = await screen.findByTestId('entry-fold-category');
    expect(folded).toHaveTextContent('Chuyển sang ví');
    expect(screen.getByTestId('entry-wallet-row')).toBeInTheDocument();
    expect(screen.getByTestId('entry-to-wallet-row')).toBeInTheDocument();
  });

  it('folds "Mua tài sản" into fold line with asset row and quantity visible', async () => {
    const user = userEvent.setup();
    mockEntryApi([binanceWallet]);

    renderEntryPage('/entries/new?type=expense&wallet=w-inv');
    await enterAmountAndFold(user);

    await user.click(screen.getByTestId('category-tile-buy'));

    expect(screen.queryByTestId('category-grid')).toBeNull();
    const folded = await screen.findByTestId('entry-fold-category');
    expect(folded).toHaveTextContent('Mua tài sản');
    expect(screen.getByTestId('entry-asset-row')).toBeInTheDocument();
    expect(screen.getByTestId('entry-quantity')).toBeInTheDocument();
  });

  it('handles tab switch from expense to income and loan-debt cleanly', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user, '120000');

    await user.click(screen.getByTestId('category-tile-cat-food'));
    expect(await screen.findByTestId('entry-fold-category')).toHaveTextContent('Ăn uống');

    await user.click(screen.getByTestId('entry-tab-income'));

    const amountFold = await screen.findByTestId('entry-fold-amount');
    expect(amountFold).toHaveTextContent('120.000₫');
    expect(screen.getByText('Thu từ đâu?')).toBeInTheDocument();
    const grid = screen.getByTestId('category-grid');
    expect(within(grid).queryByRole('button', { pressed: true })).toBeNull();
    expect(screen.queryByTestId('entry-fold-details')).toBeNull();

    // Owner approved 2026-11-21 (Part 3): Vay/Nợ shares the page's form. The amount stays folded, there is no
    // category on a loan, and the details line is there.
    await user.click(screen.getByTestId('entry-tab-loan-debt'));
    expect(await screen.findByTestId('entry-fold-amount')).toHaveTextContent('120.000₫');
    expect(screen.queryByTestId('entry-fold-category')).toBeNull();
    expect(screen.queryByTestId('category-grid')).toBeNull();
    // #140: payer and date are always shown on Vay/Nợ, in the shared details card.
    expect(screen.getByTestId('shared-details-card')).toBeInTheDocument();
  });

  it('keeps category grid open with error state when saving expense with no category', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user, '120000');

    const saveBtn = screen.getByTestId('entry-save-btn');
    expect(saveBtn).toBeEnabled();
    await user.click(saveBtn);

    const grid = await screen.findByTestId('category-grid');
    expect(grid).toBeInTheDocument();
    expect(grid.className).toContain('ring-danger');
    expect(screen.getByTestId('category-error')).toHaveTextContent('Hãy chọn một danh mục.');
  });

  it('keeps chosen category folded when reopening amount, editing it, and pressing Xong', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user, '50000');

    await user.click(screen.getByTestId('category-tile-cat-food'));
    expect(await screen.findByTestId('entry-fold-category')).toHaveTextContent('Ăn uống');

    await user.click(screen.getByTestId('entry-fold-amount'));
    await screen.findByTestId('amount-keypad');
    await user.click(screen.getByTestId('key-0'));
    await user.click(screen.getByTestId('key-done'));

    expect(await screen.findByTestId('entry-fold-category')).toHaveTextContent('Ăn uống');
    expect(screen.queryByTestId('category-grid')).toBeNull();
    expect(screen.getByTestId('entry-fold-details')).toBeInTheDocument();
  });

  it('keeps the transfer choice folded when reopening amount and pressing Xong', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user, '50000');

    await user.click(screen.getByTestId('category-tile-transfer'));
    expect(await screen.findByTestId('entry-fold-category')).toHaveTextContent('Chuyển sang ví');

    await user.click(screen.getByTestId('entry-fold-amount'));
    await screen.findByTestId('amount-keypad');
    await user.click(screen.getByTestId('key-done'));

    expect(await screen.findByTestId('entry-fold-category')).toHaveTextContent('Chuyển sang ví');
    expect(screen.queryByTestId('category-grid')).toBeNull();
    expect(screen.getByTestId('entry-wallet-row')).toBeInTheDocument();
  });

  it('reopens category grid on Thu tab when amount is folded and Ăn uống was picked (I1b)', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user, '120000');

    await user.click(screen.getByTestId('category-tile-cat-food'));
    expect(await screen.findByTestId('entry-fold-category')).toBeInTheDocument();

    await user.click(screen.getByTestId('entry-tab-income'));
    expect(await screen.findByTestId('category-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('entry-fold-category')).toBeNull();
  });

  it('moves focus to entry-fold-category after picking Ăn uống (I4)', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user, '120000');

    await user.click(screen.getByTestId('category-tile-cat-food'));
    const foldedCat = await screen.findByTestId('entry-fold-category');
    expect(document.activeElement).toBe(foldedCat);

    await user.click(foldedCat);
    const tile = await screen.findByTestId('category-tile-cat-food');
    expect(document.activeElement).toBe(tile);
  });

  it('folds open amount and focuses entry-fold-category when tapping Ăn uống after Escape', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    for (const ch of '120000') {
      await user.click(screen.getByTestId(`key-${ch}`));
    }
    await user.keyboard('{Escape}');

    await user.click(await screen.findByTestId('category-tile-cat-food'));

    const foldedAmount = await screen.findByTestId('entry-fold-amount');
    expect(foldedAmount).toHaveTextContent('120.000₫');
    const foldedCategory = await screen.findByTestId('entry-fold-category');
    expect(foldedCategory).toHaveTextContent('Ăn uống');
    expect(document.activeElement).toBe(foldedCategory);
  });

  it('folds open amount and shows entry-asset-row when tapping "Mua tài sản" after Escape', async () => {
    const user = userEvent.setup();
    mockEntryApi([binanceWallet]);

    renderEntryPage('/entries/new?type=expense&wallet=w-inv');
    await screen.findByTestId('amount-keypad');
    for (const ch of '120000') {
      await user.click(screen.getByTestId(`key-${ch}`));
    }
    await user.keyboard('{Escape}');

    await user.click(await screen.findByTestId('category-tile-buy'));

    expect(await screen.findByTestId('entry-fold-amount')).toBeInTheDocument();
    expect(await screen.findByTestId('entry-asset-row')).toBeVisible();
  });
});
