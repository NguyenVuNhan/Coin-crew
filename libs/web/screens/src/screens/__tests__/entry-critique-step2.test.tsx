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

describe('EntryPage critique step 2 — Vay/Nợ form', () => {
  it('uses AmountKeypad (no amount <input>) and orders Với ai -> Người trả -> Ghi chú in DOM order', async () => {
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    const { container } = renderEntryPage(['/entries/new?type=loan-debt']);

    const amountDisplay = await screen.findByTestId('amount-display');
    expect(amountDisplay).toBeInTheDocument();
    expect(screen.getByTestId('amount-keypad')).toBeInTheDocument();
    expect(container.querySelector('#expense-amount')).toBeNull();

    const withRow = screen.getByTestId('loan-debt-with-row');
    const payerRow = screen.getByTestId('loan-debt-payer-row');
    const noteInput = container.querySelector('#expense-what-for') as HTMLElement;
    expect(noteInput).toBeTruthy();

    expect(
      amountDisplay.compareDocumentPosition(withRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      withRow.compareDocumentPosition(payerRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      payerRow.compareDocumentPosition(noteInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('hides split segment until "Chia khác" is tapped, then shows the five word labels', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage(['/entries/new?type=loan-debt']);
    await screen.findByTestId('loan-debt-split-toggle');

    expect(screen.queryByRole('radiogroup', { name: 'Cách chia' })).toBeNull();

    await user.click(screen.getByTestId('loan-debt-split-toggle'));

    const picker = await screen.findByRole('radiogroup', { name: 'Cách chia' });
    expect(within(picker).getByText('Đều')).toBeInTheDocument();
    expect(within(picker).getByText('Số tiền')).toBeInTheDocument();
    expect(within(picker).getByText('%')).toBeInTheDocument();
    expect(within(picker).getByText('Phần')).toBeInTheDocument();
    expect(within(picker).getByText('Cộng/trừ')).toBeInTheDocument();
  });

  it('shows disabled reason text for no amount and for no other person', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
    });

    renderEntryPage(['/entries/new?type=loan-debt']);
    await screen.findByTestId('amount-keypad');

    // Close keypad by tapping outside (on the header or note label)
    await user.click(screen.getByText('Ghi chú'));

    const saveBtn = await screen.findByTestId('entry-save-btn');
    expect(saveBtn).toBeDisabled();
    expect(screen.getByTestId('loan-debt-disabled-reason')).toHaveTextContent('Nhập số tiền');

    // Enter amount via keypad -> closes keypad -> now missing other person
    await user.click(screen.getByTestId('amount-display'));
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('key-0'));
    await user.click(screen.getByTestId('key-000'));
    await user.click(screen.getByText('Ghi chú'));

    expect(await screen.findByTestId('entry-save-btn')).toBeDisabled();
    expect(screen.getByTestId('loan-debt-disabled-reason')).toHaveTextContent(
      'Chọn ít nhất một người',
    );
  });

  it('saves via the quick-expense API with the same payload and returns with the snackbar', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
      'POST /api/trips/t-led/expenses': () => Response.json({ expenseId: 'exp-1' }, { status: 201 }),
    });

    const { container } = renderEntryPage(['/trips', '/entries/new?type=loan-debt']);
    await screen.findByTestId('amount-keypad');

    // Enter 50.000
    await user.click(screen.getByTestId('key-5'));
    await user.click(screen.getByTestId('key-0'));
    await user.click(screen.getByTestId('key-000'));

    // Pick Minh in "Với ai"
    await user.click(screen.getByTestId('loan-debt-with-row'));
    const minhBtn = await screen.findByRole('button', { name: /Minh/ });
    await user.click(minhBtn);
    await user.click(screen.getByRole('button', { name: 'Xong' }));

    // Enter note
    const noteInput = container.querySelector('#expense-what-for') as HTMLInputElement;
    await user.type(noteInput, 'Trà sữa');

    // Save
    const saveBtn = await screen.findByTestId('entry-save-btn');
    expect(saveBtn).toBeEnabled();
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByTestId('trips-route')).toBeInTheDocument();
    });

    const postCall = calls.find(
      (c) => c.method === 'POST' && c.path.includes('/api/trips/t-led/expenses'),
    );
    expect(postCall).toBeDefined();
    expect(postCall?.body).toMatchObject({
      description: 'Trà sữa',
      amount: 50_000,
      payerId: 'led-o',
      mode: 'equal',
      entries: [
        { participantId: 'led-o', value: 1 },
        { participantId: 'led-m', value: 1 },
      ],
    });
    expect(screen.getByText('Đã lưu')).toBeInTheDocument();
  });

  it('opens Payer sheet with you first and triggers small-amount guard for VND 1..999', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
      'GET /api/me/personal/wallets': { wallets: [vndCash] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': [],
      'POST /api/trips/t-led/expenses': () => Response.json({ expenseId: 'exp-2' }, { status: 201 }),
    });

    const { container } = renderEntryPage(['/trips', '/entries/new?type=loan-debt']);
    await screen.findByTestId('amount-keypad');

    // Type 85 (1..999 VND)
    await user.click(screen.getByTestId('key-8'));
    await user.click(screen.getByTestId('key-5'));

    // Pick Minh in "Với ai"
    await user.click(screen.getByTestId('loan-debt-with-row'));
    await user.click(await screen.findByRole('button', { name: /Minh/ }));
    await user.click(screen.getByRole('button', { name: 'Xong' }));

    // Open Payer sheet: "An (tôi)" comes before "Minh", switch to Minh
    await user.click(screen.getByTestId('loan-debt-payer-row'));
    const payerList = await screen.findByTestId('payer-picker-list');
    const payerButtons = within(payerList).getAllByRole('button');
    expect(payerButtons[0]).toHaveTextContent('An (tôi)');
    expect(payerButtons[1]).toHaveTextContent('Minh');
    await user.click(payerButtons[1]!);
    expect(screen.getByTestId('loan-debt-payer-row')).toHaveTextContent('Minh');

    // Enter note & save -> triggers small-amount guard
    const noteInput = container.querySelector('#expense-what-for') as HTMLInputElement;
    await user.type(noteInput, 'Cà phê');
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
      description: 'Cà phê',
      amount: 85_000,
      payerId: 'led-m',
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
