import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { CategoriesResponse, CategoryView, TripView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { mockApi } from '../../test/render';
import { finishAmount, openDetails, pickPeople } from '../../test/entry';
import { NavHistoryProvider } from '../../lib/navHistory';
import { EntryPage } from '../EntryPage';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  setLang('vi');
  // Tuesday 17 Nov 2026, 08:20 local; only Date is faked so userEvent and waitFor keep working.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 17, 8, 20));
});

afterEach(() => {
  vi.useRealTimers();
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

const foodCat: CategoryView = {
  id: 'cat-food',
  type: 'expense',
  name: 'Ăn uống',
  icon: 'utensils',
  parentId: null,
  sortOrder: 0,
  hidden: false,
};

const categoriesResp: CategoriesResponse = { categories: [foodCat], recentIds: ['cat-food'] };

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
    me: { kind: 'member', participantId: 'led-o', participantPending: false, isOrganiser: true },
    people: [
      { id: 'led-o', name: 'An', status: 'active', isMember: true, bank: 'none' },
      { id: 'led-m', name: 'Minh', status: 'active', isMember: false, bank: 'none' },
    ],
    balances: { 'led-o': 0, 'led-m': 0 },
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
              <Route path="/trips" element={<div data-testid="trips-route">Trips</div>} />
            </Routes>
          </NavHistoryProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

describe('EntryPage critique step 3 — date row', () => {
  it('has no datetime-local input; the row reads Hôm nay · 08:20', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
    });
    const { container } = renderEntryPage('/entries/new?type=expense');
    await finishAmount(user, '50000');
    await user.click(screen.getByTestId('category-tile-cat-food'));
    await openDetails(user);
    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.getByTestId('entry-date-row')).toHaveTextContent('Hôm nay · 08:20');
  });

  it('saving after Hôm qua posts yesterday with the original time', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'POST /api/me/personal/transactions': () => Response.json({ entries: [] }, { status: 201 }),
    });
    renderEntryPage('/entries/new?type=expense');
    await finishAmount(user, '50000');
    await user.click(screen.getByTestId('category-tile-cat-food'));
    await openDetails(user);
    await user.click(screen.getByRole('button', { name: 'Hôm qua' }));
    expect(screen.getByTestId('entry-date-row')).toHaveTextContent('Hôm qua · 08:20');
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(
        calls.find((c) => c.method === 'POST' && c.path.includes('/personal/transactions')),
      ).toBeDefined();
    });
    const post = calls.find((c) => c.method === 'POST' && c.path.includes('/personal/transactions'));
    expect(post?.body).toMatchObject({ date: '2026-11-16', time: '08:20' });
  });

  // Owner approved 2026-11-21 (Part 3): on Vay/Nợ the date row sits inside the folded details.
  it('Vay/Nợ shows the row without time and posts the chosen date', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/me/personal/group-settings': {
        settings: { defaultGroupCategoryId: null, countLoans: false },
      },
      'PUT /api/me/personal/group-links/exp-1': () =>
        Response.json({
          link: { walletId: 'w-vnd', categoryId: null, tagIds: [], intent: 'loan', excludeFromReports: false },
        }),
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
      'POST /api/trips/t-led/expenses': () => Response.json({ expenseId: 'exp-1' }, { status: 201 }),
    });
    renderEntryPage('/entries/new?type=loan-debt');
    await finishAmount(user, '50000');
    await pickPeople(user, ['Minh']);
    await openDetails(user);

    const row = screen.getByTestId('entry-date-row');
    expect(row).toHaveTextContent('Hôm nay');
    expect(row).not.toHaveTextContent('08:20');
    expect(screen.queryByRole('button', { name: 'Đổi giờ' })).toBeNull();

    fireEvent.change(screen.getByTestId('entry-date-picker'), { target: { value: '2026-11-12' } });
    expect(screen.getByTestId('entry-date-row')).toHaveTextContent('Thứ Năm, 12/11');

    await user.click(await screen.findByTestId('entry-save-btn'));
    await waitFor(() => expect(screen.getByTestId('trips-route')).toBeInTheDocument());
    const post = calls.find((c) => c.method === 'POST' && c.path.includes('/api/trips/t-led/expenses'));
    expect(post?.body).toMatchObject({ spentOn: '2026-11-12', amount: 50_000 });
  });
});
