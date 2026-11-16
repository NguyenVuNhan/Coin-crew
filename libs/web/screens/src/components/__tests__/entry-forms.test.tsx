import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { CategoriesResponse, CategoryView, EntryView, TagView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { writeLastWallet } from '@cc/web-data-access/personalMoney';
import { renderAt, mockApi } from '../../test/render';
import { NavHistoryProvider } from '../../lib/navHistory';
import { EntryPage } from '../../screens/EntryPage';
import { AppNav } from '../AppNav';
import { UndoSnackbarHost, hideUndo } from '../UndoSnackbarHost';

beforeEach(() => {
  localStorage.clear();
  hideUndo();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
});

const vndCash: WalletDetailView = {
  id: 'w-vnd',
  name: 'Cash',
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

const vndBank: WalletDetailView = {
  id: 'w-bank',
  name: 'Vietcombank',
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

const usdWallet: WalletDetailView = {
  id: 'w-usd',
  name: 'USD Card',
  currency: 'USD',
  balance: 500_00,
  isDefault: false,
  kind: 'everyday',
  startAmount: 500_00,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: null,
  icon: null,
  sortOrder: 2,
  archived: false,
  entryCount: 0,
};

const usdtWallet: WalletDetailView = {
  id: 'w-usdt',
  name: 'USDT',
  currency: 'USDT',
  balance: 100_00,
  isDefault: false,
  kind: 'investment',
  startAmount: 100_00,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: null,
  icon: null,
  sortOrder: 3,
  archived: false,
  entryCount: 0,
};

const categories: CategoryView[] = [
  { id: 'c-food', parentId: null, type: 'expense', name: 'Food', icon: 'utensils', hidden: false, sortOrder: 0 },
  { id: 'c-move', parentId: null, type: 'expense', name: 'Transport', icon: 'bus', hidden: false, sortOrder: 1 },
  { id: 'c-shop', parentId: null, type: 'expense', name: 'Shopping', icon: 'shopping-bag', hidden: false, sortOrder: 2 },
  { id: 'c-bill', parentId: null, type: 'expense', name: 'Bills', icon: 'receipt', hidden: false, sortOrder: 3 },
  { id: 'c-health', parentId: null, type: 'expense', name: 'Health', icon: 'heart-pulse', hidden: false, sortOrder: 4 },
  { id: 'c-invest', parentId: null, type: 'expense', name: 'Invest', icon: 'trending-up', hidden: false, sortOrder: 5 },
  { id: 'c-crypto', parentId: 'c-invest', type: 'expense', name: 'Crypto', icon: 'coins', hidden: false, sortOrder: 0 },
  { id: 'c-hidden', parentId: null, type: 'expense', name: 'Hidden', icon: 'receipt', hidden: true, sortOrder: 6 },
  { id: 'c-salary', parentId: null, type: 'income', name: 'Salary', icon: 'wallet', hidden: false, sortOrder: 0 },
];

const categoriesRes: CategoriesResponse = {
  categories,
  recentIds: ['c-health', 'c-bill'],
};

const tagsList: TagView[] = [
  { id: 't-1', name: 'coffee', useCount: 5 },
  { id: 't-2', name: 'coworkers', useCount: 3 },
  { id: 't-3', name: 'travel', useCount: 2 },
];

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderEntryPage(route = '/entries/new?type=expense') {
  setLang('en');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <PlatformProvider platform={browserPlatform}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>
          <NavHistoryProvider>
            <UndoSnackbarHost />
            <Routes>
              <Route path="/entries/new" element={<EntryPage />} />
              <Route path="/entries/:id/edit" element={<EntryPage />} />
              <Route path="*" element={null} />
            </Routes>
            <LocationProbe />
          </NavHistoryProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

describe('EntryPage and AddMenu', () => {
  it('renders AmountKeypad with no amount <input>, prefills last used wallet and today', async () => {
    writeLastWallet('w-bank');
    mockApi({
      'GET /api/me/personal/wallets': { wallets: [vndCash, vndBank] },
      'GET /api/me/personal/categories': categoriesRes,
      'GET /api/me/personal/tags': { tags: tagsList },
    });

    renderEntryPage();

    expect(await screen.findByTestId('amount-keypad')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getByTestId('entry-wallet-row')).toHaveTextContent('Vietcombank (VND)');
    expect(screen.getByTestId('entry-date-input')).toHaveValue(todayYmd());
  });

  it('places recent categories first and fills up to six tiles', async () => {
    mockApi({
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesRes,
      'GET /api/me/personal/tags': { tags: [] },
    });

    renderEntryPage();

    const picker = await screen.findByTestId('category-picker');
    const tileButtons = within(picker)
      .getAllByRole('button')
      .filter((btn) => btn.dataset.testid?.startsWith('category-tile-'));

    expect(tileButtons.map((b) => b.dataset.testid)).toEqual([
      'category-tile-c-health',
      'category-tile-c-bill',
      'category-tile-c-food',
      'category-tile-c-move',
      'category-tile-c-shop',
      'category-tile-c-invest',
    ]);
    expect(within(picker).queryByTestId('category-tile-c-hidden')).toBeNull();
  });

  it('amount -> category -> done posts once, saves last wallet, navigates back, and shows snackbar', async () => {
    const user = userEvent.setup();
    const createdEntry: EntryView = {
      id: 'e-1',
      walletId: 'w-vnd',
      type: 'expense',
      amount: 50000,
      currency: 'VND',
      categoryId: 'c-food',
      transferId: null,
      counterpartWalletId: null,
      date: todayYmd(),
      time: null,
      note: null,
      tags: [],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-16T10:00:00.000Z',
    };

    const { calls } = mockApi({
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesRes,
      'GET /api/me/personal/tags': { tags: [] },
      'POST /api/me/personal/transactions': { entries: [createdEntry] },
    });

    renderEntryPage();

    await screen.findByTestId('amount-keypad');
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('key-0'));
    await user.click(screen.getByTestId('key-000'));
    await user.click(screen.getByTestId('category-tile-c-food'));
    await user.click(screen.getByTestId('key-done'));

    await waitFor(() => {
      const posts = calls.filter((c) => c.method === 'POST' && c.path === '/api/me/personal/transactions');
      expect(posts).toHaveLength(1);
      expect(posts[0]?.body).toMatchObject({
        type: 'expense',
        walletId: 'w-vnd',
        amount: 50000,
        categoryId: 'c-food',
        excludeFromReports: false,
      });
    });

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/trips'));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('USD wallet accepts "12,5" and posts 1250 minor units', async () => {
    const user = userEvent.setup();
    writeLastWallet('w-usd');
    const { calls } = mockApi({
      'GET /api/me/personal/wallets': { wallets: [vndCash, usdWallet] },
      'GET /api/me/personal/categories': categoriesRes,
      'GET /api/me/personal/tags': { tags: [] },
      'POST /api/me/personal/transactions': { entries: [] },
    });

    renderEntryPage();

    await screen.findByTestId('amount-keypad');
    await user.click(screen.getByTestId('key-1'));
    await user.click(screen.getByTestId('key-2'));
    await user.click(screen.getByTestId('key-comma'));
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('category-tile-c-food'));
    await user.click(screen.getByTestId('key-done'));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.path === '/api/me/personal/transactions');
      expect(post?.body).toMatchObject({
        walletId: 'w-usd',
        amount: 1250,
      });
    });
  });

  it('VND<->USDT transfer asks for received amount and shows implied rate; same-currency does not', async () => {
    const user = userEvent.setup();
    writeLastWallet('w-vnd');
    mockApi({
      'GET /api/me/personal/wallets': { wallets: [vndCash, vndBank, usdtWallet] },
      'GET /api/me/personal/categories': categoriesRes,
      'GET /api/me/personal/tags': { tags: [] },
    });

    renderEntryPage('/entries/new?type=transfer');

    await screen.findByTestId('amount-sent-box');
    // Initially from=w-vnd, to=w-bank (same currency VND -> VND): no amount-received-box
    expect(screen.queryByTestId('amount-received-box')).toBeNull();

    // Switch To wallet to USDT
    await user.click(screen.getByTestId('entry-to-wallet-row'));
    await user.click(screen.getByTestId('wallet-option-w-usdt'));

    expect(screen.getByTestId('amount-received-box')).toBeInTheDocument();

    // Type 2500000 VND sent
    await user.click(screen.getByTestId('key-2'));
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('key-0'));
    await user.click(screen.getByTestId('key-0'));
    await user.click(screen.getByTestId('key-000'));

    // Tap received box and type 100 USDT
    await user.click(screen.getByTestId('amount-received-box'));
    await user.click(screen.getByTestId('key-1'));
    await user.click(screen.getByTestId('key-0'));
    await user.click(screen.getByTestId('key-0'));

    expect(screen.getByTestId('transfer-implied-rate')).toHaveTextContent('1 USDT ≈ 25.000');
  });

  it('exclude switch starts on for transfer and off for expense', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/personal/wallets': { wallets: [vndCash, vndBank] },
      'GET /api/me/personal/categories': categoriesRes,
      'GET /api/me/personal/tags': { tags: [] },
    });

    const { unmount } = renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('entry-more-details-toggle');
    await user.click(screen.getByTestId('entry-more-details-toggle'));
    expect(screen.getByTestId('entry-exclude-switch')).toHaveAttribute('aria-checked', 'false');
    unmount();

    renderEntryPage('/entries/new?type=transfer');
    await screen.findByTestId('entry-more-details-toggle');
    await user.click(screen.getByTestId('entry-more-details-toggle'));
    expect(screen.getByTestId('entry-exclude-switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('suggests existing tags while typing and adds on click or Enter', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesRes,
      'GET /api/me/personal/tags': { tags: tagsList },
    });

    renderEntryPage();

    await screen.findByTestId('entry-more-details-toggle');
    await user.click(screen.getByTestId('entry-more-details-toggle'));

    const tagInput = screen.getByTestId('tag-input-field');
    await user.type(tagInput, 'co');

    expect(screen.getByTestId('tag-suggestion-coffee')).toBeInTheDocument();
    expect(screen.getByTestId('tag-suggestion-coworkers')).toBeInTheDocument();
    expect(screen.queryByTestId('tag-suggestion-travel')).toBeNull();

    await user.click(screen.getByTestId('tag-suggestion-coffee'));
    expect(screen.getByTestId('tag-chip-coffee')).toBeInTheDocument();

    await user.type(tagInput, 'lunch{Enter}');
    expect(screen.getByTestId('tag-chip-lunch')).toBeInTheDocument();
  });

  it('shows plain error message on 422 and keeps user input', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesRes,
      'GET /api/me/personal/tags': { tags: [] },
      'POST /api/me/personal/transactions': () =>
        Response.json(
          { error: { code: 'VALIDATION', message: 'Bad amount', details: { reason: 'amountInvalid' } } },
          { status: 422 },
        ),
    });

    renderEntryPage();

    await screen.findByTestId('amount-keypad');
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('key-000'));
    await user.type(screen.getByTestId('entry-note-input'), 'Bún bò');
    await user.click(screen.getByTestId('category-tile-c-food'));
    await user.click(screen.getByTestId('key-done'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Something here isn't right. Check it and try again.");
    expect(screen.getByTestId('entry-note-input')).toHaveValue('Bún bò');
    expect(screen.getByTestId('amount-display')).toHaveTextContent('5.000');
  });

  it('edit mode loads entry from list query and locks transfer vs non-transfer', async () => {
    const existing: EntryView = {
      id: 'e-edit-1',
      walletId: 'w-vnd',
      type: 'expense',
      amount: 75000,
      currency: 'VND',
      categoryId: 'c-food',
      transferId: null,
      counterpartWalletId: null,
      date: todayYmd(),
      time: null,
      note: 'Phở',
      tags: ['breakfast'],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-16T08:00:00.000Z',
    };

    mockApi({
      'GET /api/me/personal/wallets': { wallets: [vndCash, vndBank] },
      'GET /api/me/personal/categories': categoriesRes,
      'GET /api/me/personal/tags': { tags: tagsList },
      'GET /api/me/personal/transactions': {
        rows: [{ kind: 'entry', entry: existing }],
        totals: [],
      },
    });

    renderEntryPage('/entries/e-edit-1/edit');

    expect(await screen.findByTestId('amount-display')).toHaveTextContent('75.000');
    expect(screen.getByTestId('entry-note-input')).toHaveValue('Phở');
    expect(screen.getByTestId('entry-tab-transfer')).toBeDisabled();
    expect(screen.getByTestId('entry-tab-income')).not.toBeDisabled();
  });

  it('"+" menu shows the four items when personal area is on and ≥2 wallets, and old link when off', async () => {
    const user = userEvent.setup();

    // Off: old link
    mockApi({
      'GET /api/me/personal/wallets': { wallets: [vndCash, vndBank] },
    });
    const { unmount } = renderAt(<AppNav section="home" addHref="/t/t-led/expenses/new" />, { route: '/trips' });
    const barOff = screen.getByTestId('app-nav-bar');
    expect(within(barOff).getByTestId('nav-add')).toHaveAttribute('href', '/t/t-led/expenses/new');
    unmount();

    // On: popover with 4 items
    localStorage.setItem('personalArea', '1');
    mockApi({
      'GET /api/me/personal/wallets': { wallets: [vndCash, vndBank] },
    });
    renderAt(<AppNav section="home" addHref="/t/t-led/expenses/new" />, { route: '/trips' });

    const barOn = screen.getByTestId('app-nav-bar');
    await user.click(within(barOn).getByTestId('nav-add'));

    expect(await screen.findByTestId('add-menu-expense')).toHaveAttribute('href', '/entries/new?type=expense');
    expect(screen.getByTestId('add-menu-income')).toHaveAttribute('href', '/entries/new?type=income');
    expect(screen.getByTestId('add-menu-transfer')).toHaveAttribute('href', '/entries/new?type=transfer');
    expect(screen.getByTestId('add-menu-with-people')).toHaveAttribute('href', '/t/t-led/expenses/new');
  });
});
