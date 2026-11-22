import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { CategoriesResponse, CategoryView, EntryView, TripView, WalletDetailView } from '@cc/core';
import { setLang, t } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { todayLocal } from '@cc/web-util/localDate';
import { mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { NavHistoryProvider } from '../../lib/navHistory';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';
import { EntryPage, formatDetailsFoldSummary } from '../EntryPage';

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

function renderEntryPage(route: string, state?: unknown) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  const [pathname, search] = route.split('?');
  return render(
    <PlatformProvider platform={browserPlatform}>
      <QueryClientProvider client={qc}>
        <MemoryRouter
          initialEntries={[
            { pathname: '/trips' },
            { pathname, search: search ? `?${search}` : '', state },
          ]}
          initialIndex={1}
        >
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

describe('EntryPage — details folding on phones (Task 4)', () => {
  it('shows entry-fold-details only after category is done, and hides compact rows before and after', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await screen.findByTestId('amount-keypad');

    // Step 1 (amount open): neither details line nor compact rows render
    expect(screen.queryByTestId('entry-fold-details')).toBeNull();
    expect(screen.queryByTestId('entry-note-input')).toBeNull();
    expect(screen.queryByTestId('entry-date-row')).toBeNull();
    expect(screen.queryByTestId('entry-wallet-row')).toBeNull();

    // Step 2 (amount folded, category open): note is visible under category; details line and compact rows remain absent
    await enterAmountAndFold(user);
    expect(screen.queryByTestId('entry-fold-details')).toBeNull();
    expect(screen.getByTestId('entry-note-input')).toBeInTheDocument();
    expect(screen.queryByTestId('entry-date-row')).toBeNull();
    expect(screen.queryByTestId('entry-wallet-row')).toBeNull();

    // Step 3 (category folded): entry-fold-details appears below note; compact rows remain absent
    await user.click(screen.getByTestId('category-tile-cat-food'));
    const categoryFold = screen.getByTestId('entry-fold-category');
    const noteInput = screen.getByTestId('entry-note-input');
    const detailsFold = await screen.findByTestId('entry-fold-details');
    expect(detailsFold).toHaveTextContent('Thêm chi tiết');
    expect(detailsFold).toHaveTextContent('Hôm nay · Tiền mặt · Không ghi chú');
    expect(
      categoryFold.compareDocumentPosition(noteInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      noteInput.compareDocumentPosition(detailsFold) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(screen.queryByTestId('entry-date-row')).toBeNull();
    expect(screen.queryByTestId('entry-date-value')).toBeNull();
    expect(screen.queryByTestId('entry-date-picker')).toBeNull();
    expect(screen.queryByTestId('entry-wallet-row')).toBeNull();
    expect(screen.queryByTestId('entry-more-details-toggle')).toBeNull();
  });

  it('expands compact rows and entry-more-details-toggle when clicking entry-fold-details', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user);
    await user.click(screen.getByTestId('category-tile-cat-food'));

    const detailsFold = await screen.findByTestId('entry-fold-details');
    await user.click(detailsFold);

    expect(screen.queryByTestId('entry-fold-details')).toBeNull();
    expect(screen.getByTestId('entry-wallet-row')).toBeInTheDocument();
    expect(screen.getByTestId('entry-date-row')).toBeInTheDocument();
    expect(screen.getByTestId('entry-note-input')).toBeInTheDocument();
    expect(screen.getByTestId('entry-more-details-toggle')).toBeInTheDocument();
  });

  it('starts with details expanded in edit mode with note "Phở" and date yesterday', async () => {
    mockEntryApi();
    const now = new Date();
    const yesterday = todayLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const existingEntry: EntryView = {
      id: 'e-edit-1',
      type: 'expense',
      amount: 55_000,
      currency: 'VND',
      walletId: vndCash.id,
      categoryId: foodCat.id,
      date: yesterday,
      time: '08:30',
      note: 'Phở',
      tags: [],
      excludeFromReports: false,
      transferId: null,
      counterpartWalletId: null,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-10T08:30:00Z',
    };

    renderEntryPage('/entries/e-edit-1/edit', { entry: existingEntry });

    const noteInput = await screen.findByTestId('entry-note-input');
    expect(noteInput).toHaveValue('Phở');
    expect(screen.queryByTestId('entry-fold-details')).toBeNull();
    expect(screen.getByTestId('entry-date-value')).toHaveTextContent('Hôm qua');
    expect(screen.getByTestId('entry-wallet-row')).toBeInTheDocument();
    expect(screen.getByTestId('entry-more-details-toggle')).toBeInTheDocument();
  });

  it('formats the folded details summary with note "Phở" and truncates notes longer than 24 chars', () => {
    const today = todayLocal(new Date());
    expect(
      formatDetailsFoldSummary({
        date: today,
        walletName: 'Tiền mặt',
        note: '  Phở  ',
        includeWallet: true,
        translate: t,
      }),
    ).toBe('Hôm nay · Tiền mặt · Phở');

    expect(
      formatDetailsFoldSummary({
        date: today,
        walletName: 'Tiền mặt',
        note: '1234567890123456789012345',
        includeWallet: true,
        translate: t,
      }),
    ).toBe('Hôm nay · Tiền mặt · 123456789012345678901234…');
  });

  it('keeps wallet rows and note visible for transfer and folds date behind entry-fold-details', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user);
    await user.click(screen.getByTestId('category-tile-transfer'));

    expect(screen.getByTestId('entry-wallet-row')).toBeInTheDocument();
    expect(screen.getByTestId('entry-to-wallet-row')).toBeInTheDocument();

    const detailsFold = await screen.findByTestId('entry-fold-details');
    expect(detailsFold).toHaveTextContent('Thêm chi tiết');
    expect(detailsFold).toHaveTextContent('Hôm nay · Không ghi chú');
    expect(screen.queryByTestId('entry-date-row')).toBeNull();
    expect(screen.getByTestId('entry-note-input')).toBeInTheDocument();
  });

  it('opens details when hasArchivedWallet is true so entry-wallet-row is visible and entry-fold-details is absent', async () => {
    const archivedCash: WalletDetailView = {
      ...vndCash,
      archived: true,
    };
    mockEntryApi([archivedCash, bankWallet]);
    const today = todayLocal(new Date());
    const archivedEntry: EntryView = {
      id: 'e-arch-1',
      type: 'expense',
      amount: 50_000,
      currency: 'VND',
      walletId: archivedCash.id,
      categoryId: foodCat.id,
      date: today,
      time: '09:00',
      note: '',
      tags: [],
      excludeFromReports: false,
      transferId: null,
      counterpartWalletId: null,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-10T09:00:00Z',
    };

    renderEntryPage('/entries/e-arch-1/edit', { entry: archivedEntry });

    expect(await screen.findByTestId('entry-wallet-row')).toBeInTheDocument();
    expect(screen.queryByTestId('entry-fold-details')).toBeNull();
    expect(screen.getByText('Ví này đã lưu trữ. Khôi phục ví để sửa giao dịch.')).toBeInTheDocument();
  });

  it('moves focus to the wallet row after opening entry-fold-details (I4)', async () => {
    const user = userEvent.setup();
    mockEntryApi();

    renderEntryPage('/entries/new?type=expense');
    await enterAmountAndFold(user);
    await user.click(screen.getByTestId('category-tile-cat-food'));

    const detailsFold = await screen.findByTestId('entry-fold-details');
    await user.click(detailsFold);

    const walletRow = await screen.findByTestId('entry-wallet-row');
    expect(document.activeElement).toBe(walletRow);
  });
});
