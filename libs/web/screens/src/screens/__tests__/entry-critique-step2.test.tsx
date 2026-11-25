import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { CategoriesResponse, CategoryView, TripView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { mockApi, renderAt } from '../../test/render';
import { NavHistoryProvider } from '../../lib/navHistory';
import { EntryPage } from '../EntryPage';
import { ExpenseForm } from '../ExpenseForm';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';
import { finishAmount, openDetails, pickPeople } from '../../test/entry';

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  setLang('vi');
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
    people: [
      { id: 'led-o', name: 'An', status: 'active', isMember: true, bank: 'none' },
      { id: 'led-m', name: 'Minh', status: 'active', isMember: false, bank: 'none' },
      { id: 'led-l', name: 'Lan', status: 'active', isMember: false, bank: 'none' },
    ],
    balances: { 'led-o': 0, 'led-m': 0, 'led-l': 0 },
    suggestions: [],
    expenses: [],
    payments: [],
    myBalance: null,
    approvals: [],
    links: null,
  };
}

function renderEntryPage(initialEntries: string[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <PlatformProvider platform={browserPlatform}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={initialEntries}>
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

const loanRoutes = (extra: Record<string, unknown> = {}) => ({
  'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
  'GET /api/me/personal/wallets': { wallets: [vndCash] },
  'GET /api/me/personal/categories': categoriesResp,
  'GET /api/trips/t-led': directTripView(),
  'GET /api/me/people/candidates': [],
  'GET /api/me/personal/group-settings': {
    settings: { defaultGroupCategoryId: null, countLoans: false },
  },
  ...extra,
});

const loanLink = (expenseId: string) => ({
  [`PUT /api/me/personal/group-links/${expenseId}`]: () =>
    Response.json({
      link: { walletId: 'w-vnd', categoryId: null, tagIds: [], intent: 'loan', excludeFromReports: false },
    }),
});

describe('EntryPage critique step 2 — Vay/Nợ form', () => {
  // Owner approved 2026-11-21 (Part 3): Vay/Nợ is the entry page's own loan form; people chips replace the
  // "Với ai" and "Người trả" rows, and the note sits in the folded details.
  it('uses AmountKeypad (no amount <input>) and orders amount -> Với ai? chips -> folded details in DOM order', async () => {
    const user = userEvent.setup();
    mockApi(loanRoutes());

    const { container } = renderEntryPage(['/entries/new?type=loan-debt']);

    expect(await screen.findByTestId('amount-keypad')).toBeInTheDocument();
    expect(container.querySelector('#expense-amount')).toBeNull();
    await finishAmount(user, '50000');
    const amountDisplay = screen.getByTestId('entry-fold-amount');

    // #140: payer and date sit in an always-open card between the amount and Với ai?.
    const people = await screen.findByTestId('entry-people');
    const details = screen.getByTestId('shared-details-card');
    expect(screen.queryByTestId('loan-debt-payer-row')).toBeNull();

    expect(
      amountDisplay.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      details.compareDocumentPosition(people) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('hides the split modes until "Cách chia" is tapped, then shows the five word labels', async () => {
    const user = userEvent.setup();
    mockApi(loanRoutes());

    renderEntryPage(['/entries/new?type=loan-debt']);
    await finishAmount(user, '100000');
    await pickPeople(user, ['Minh']);
    await pickPeople(user, ['Lan']);

    expect(screen.queryByRole('radiogroup', { name: 'Cách chia' })).toBeNull();

    await user.click(screen.getByTestId('entry-split-fold'));

    const picker = await screen.findByRole('radiogroup', { name: 'Cách chia' });
    expect(within(picker).getByText('Đều')).toBeInTheDocument();
    expect(within(picker).getByText('Số tiền')).toBeInTheDocument();
    expect(within(picker).getByText('%')).toBeInTheDocument();
    expect(within(picker).getByText('Phần')).toBeInTheDocument();
    expect(within(picker).getByText('Cộng/trừ')).toBeInTheDocument();
  });

  // The keypad stays open on a phone until there is an amount, so only the "no person" reason can show here.
  it('shows disabled reason text when no other person is chosen', async () => {
    const user = userEvent.setup();
    mockApi(loanRoutes());

    renderEntryPage(['/entries/new?type=loan-debt']);
    await finishAmount(user, '50000');

    expect(await screen.findByTestId('entry-save-btn')).toBeDisabled();
    expect(screen.getByTestId('loan-debt-disabled-reason')).toHaveTextContent(
      'Chọn ít nhất một người',
    );

    await pickPeople(user, ['Minh']);
    expect(screen.queryByTestId('loan-debt-disabled-reason')).toBeNull();
  });

  it('saves via the quick-expense API over the people picked, then the loan link, and returns with the snackbar', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(
      loanRoutes({
        'POST /api/trips/t-led/expenses': () => Response.json({ expenseId: 'exp-1' }, { status: 201 }),
        ...loanLink('exp-1'),
      }),
    );

    renderEntryPage(['/trips', '/entries/new?type=loan-debt']);
    await finishAmount(user, '50000');
    await pickPeople(user, ['Minh']);

    await openDetails(user);
    await user.type(screen.getByTestId('entry-note-input'), 'Trà sữa');

    const saveBtn = await screen.findByTestId('entry-save-btn');
    expect(saveBtn).toBeEnabled();
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByTestId('trips-route')).toBeInTheDocument();
    });

    const postCall = calls.find(
      (c) => c.method === 'POST' && c.path.includes('/api/trips/t-led/expenses'),
    );
    expect(postCall?.body).toMatchObject({
      description: 'Trà sữa',
      amount: 50_000,
      payerId: 'led-o',
      mode: 'equal',
      entries: [{ participantId: 'led-m', value: 1 }],
    });
    const putCall = calls.find(
      (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-1',
    );
    expect(putCall?.body).toMatchObject({ intent: 'loan', walletId: 'w-vnd' });
    expect(screen.getByText('Đã lưu')).toBeInTheDocument();
  });

  it('⇄ makes Minh the payer over you, and the small-amount guard still applies for VND 1..999', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(
      loanRoutes({
        'POST /api/trips/t-led/expenses': () => Response.json({ expenseId: 'exp-2' }, { status: 201 }),
        ...loanLink('exp-2'),
      }),
    );

    renderEntryPage(['/trips', '/entries/new?type=loan-debt']);
    await finishAmount(user, '85');
    await pickPeople(user, ['Minh']);
    await user.click(screen.getByTestId('entry-flip'));
    expect(screen.getByTestId('entry-outcome')).toHaveTextContent('Bạn nợ Minh');

    await user.click(await screen.findByTestId('entry-save-btn'));

    expect(await screen.findByText('Số tiền này đúng chưa?')).toBeInTheDocument();
    await user.click(screen.getByTestId('small-amount-multiply'));

    await waitFor(() => {
      expect(screen.getByTestId('trips-route')).toBeInTheDocument();
    });
    const postCall = calls.find(
      (c) => c.method === 'POST' && c.path.includes('/api/trips/t-led/expenses'),
    );
    expect(postCall?.body).toMatchObject({
      amount: 85_000,
      payerId: 'led-m',
      entries: [{ participantId: 'led-o', value: 1 }],
    });
  });

  it('guard: standalone /t/:tripId/expenses/new still renders old amount input and symbols', async () => {
    setLang('en');
    mockApi({
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    const { container } = renderAt(<ExpenseForm />, {
      route: '/t/t-led/expenses/new',
      path: '/t/:tripId/expenses/new',
    });

    expect(await screen.findByRole('heading', { level: 1, name: 'New expense' })).toBeInTheDocument();
    expect(container.querySelector('#expense-amount')).toBeInTheDocument();
    expect(screen.queryByTestId('amount-keypad')).toBeNull();

    const picker = screen.getByRole('radiogroup', { name: 'Split' });
    expect(within(picker).getByText('=')).toBeInTheDocument();
    expect(within(picker).getByText('1.23')).toBeInTheDocument();
    expect(within(picker).getByText('%')).toBeInTheDocument();
  });
});
