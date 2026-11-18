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
  sortOrder: 1,
  archived: false,
  entryCount: 0,
};

const usdWallet: WalletDetailView = {
  id: 'w-usd',
  name: 'Ví USD',
  currency: 'USD',
  balance: 50_000,
  isDefault: false,
  kind: 'everyday',
  startAmount: 50_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 1_250_000_000,
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

const categoriesResp: CategoriesResponse = {
  categories: [foodCat],
  recentIds: ['cat-food'],
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

async function tapKeypadDigits(user: ReturnType<typeof userEvent.setup>, digits: string) {
  for (const ch of digits) {
    await user.click(screen.getByTestId(`key-${ch}`));
  }
}

describe('EntryPage — amount folding on phones (Task 2)', () => {
  it('shows amount-display and hides category-grid on load in touch mode', async () => {
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-display');
    expect(screen.queryByTestId('category-grid')).toBeNull();
    expect(screen.queryByTestId('entry-fold-amount')).toBeNull();
  });

  it('folds amount into entry-fold-amount after Xong, reveals category-grid, and reopens on click', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');

    await tapKeypadDigits(user, '120000');
    await user.click(screen.getByTestId('key-done'));

    const folded = await screen.findByTestId('entry-fold-amount');
    expect(folded).toHaveTextContent('120.000₫');
    expect(screen.queryByTestId('amount-display')).toBeNull();
    expect(screen.getByTestId('category-grid')).toBeInTheDocument();

    await user.click(folded);
    expect(await screen.findByTestId('amount-display')).toBeInTheDocument();
    expect(screen.getByTestId('amount-keypad')).toBeInTheDocument();
    expect(screen.getByTestId('amount-display')).toHaveTextContent('120.000₫');
  });

  it('shows amount-wallet-chip as "· Binance" inside the folded line for an investment wallet', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [binanceWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense&wallet=w-inv');
    await screen.findByTestId('amount-keypad');

    await tapKeypadDigits(user, '120000');
    await user.click(screen.getByTestId('key-done'));

    const folded = await screen.findByTestId('entry-fold-amount');
    const chip = within(folded).getByTestId('amount-wallet-chip');
    expect(chip).toHaveTextContent('· Binance');
  });

  it('keeps category-grid visible on load and never renders entry-fold-amount in mouse mode', async () => {
    mockMedia({ mouse: true });
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('category-grid');
    expect(screen.getByTestId('amount-display')).toBeInTheDocument();
    expect(screen.queryByTestId('entry-fold-amount')).toBeNull();
  });

  it('keeps different-currency transfer open after first Xong and folds after second Xong', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=transfer');
    await screen.findByTestId('amount-received-box');

    await tapKeypadDigits(user, '250000');
    await user.click(screen.getByTestId('key-done'));

    expect(screen.queryByTestId('entry-fold-amount')).toBeNull();
    expect(screen.getByTestId('amount-display')).toBeInTheDocument();
    expect(screen.getByTestId('amount-received-box')).toBeInTheDocument();

    await user.click(screen.getByTestId('amount-received-box'));
    await tapKeypadDigits(user, '10');
    await user.click(screen.getByTestId('key-done'));

    expect(await screen.findByTestId('entry-fold-amount')).toBeInTheDocument();
    expect(screen.queryByTestId('amount-display')).toBeNull();
  });

  it('folds amount on outside click when amount > 0 (I1)', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    await tapKeypadDigits(user, '120000');

    const main = document.querySelector('main');
    expect(main).not.toBeNull();
    await user.click(main as HTMLElement);

    const folded = await screen.findByTestId('entry-fold-amount');
    expect(folded).toHaveTextContent('120.000₫');
    expect(screen.getByTestId('category-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
  });

  it('keeps amount-display focused and opens category-grid on Escape when amount > 0 (I1)', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    await tapKeypadDigits(user, '120000');

    await user.keyboard('{Escape}');

    const amountDisplay = await screen.findByTestId('amount-display');
    expect(amountDisplay).toHaveTextContent('120.000₫');
    expect(amountDisplay).toHaveFocus();
    expect(screen.getByTestId('category-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
  });

  it('keeps category and details folded when reopening amount and clicking outside (I1 Scenario B)', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    await tapKeypadDigits(user, '120000');
    await user.click(screen.getByTestId('key-done'));

    await user.click(await screen.findByTestId('category-tile-cat-food'));
    expect(await screen.findByTestId('entry-fold-category')).toBeInTheDocument();
    expect(screen.getByTestId('entry-fold-details')).toBeInTheDocument();

    await user.click(screen.getByTestId('entry-fold-amount'));
    await screen.findByTestId('amount-keypad');

    await user.click(document.querySelector('main') as HTMLElement);

    expect(await screen.findByTestId('entry-fold-amount')).toHaveTextContent('120.000₫');
    expect(screen.getByTestId('entry-fold-category')).toBeInTheDocument();
    expect(screen.getByTestId('entry-fold-details')).toBeInTheDocument();
  });

  it('reopens amount on received box with keypad when picking transfer after folding VND amount with a USD wallet (I2)', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    await tapKeypadDigits(user, '120000');
    await user.click(screen.getByTestId('key-done'));

    await user.click(await screen.findByTestId('category-tile-transfer'));

    const receivedBox = await screen.findByTestId('amount-received-box');
    expect(receivedBox).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('amount-keypad')).toBeInTheDocument();

    await tapKeypadDigits(user, '5');
    await user.click(screen.getByTestId('key-done'));

    const folded = await screen.findByTestId('entry-fold-amount');
    expect(folded.textContent).toContain('120.000₫ →');
  });

  it('keeps amount folded and keypad closed when returning from Vay/Nợ to Chi (I3)', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');
    await tapKeypadDigits(user, '120000');
    await user.click(screen.getByTestId('key-done'));
    await screen.findByTestId('entry-fold-amount');

    await user.click(screen.getByTestId('entry-tab-loan-debt'));
    expect(screen.queryByTestId('entry-fold-amount')).toBeNull();

    await user.click(screen.getByTestId('entry-tab-expense'));
    expect(await screen.findByTestId('entry-fold-amount')).toHaveTextContent('120.000₫');
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
  });
});
