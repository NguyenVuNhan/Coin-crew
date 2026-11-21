import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CategoriesResponse,
  CategoryView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { mockApi, renderAt } from '../../test/render';
import { finishAmount, openDetails, pickPeople } from '../../test/entry';
import { hideUndo } from '../../components/UndoSnackbarHost';
import { App } from '../../App';

const bankWallet: WalletDetailView = {
  id: 'w-bank',
  name: 'Techcombank',
  currency: 'VND',
  balance: 2_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 2_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 2_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 0,
};

const usdWallet: WalletDetailView = {
  id: 'w-usd',
  name: 'USD Card',
  currency: 'USD',
  balance: 10_000,
  isDefault: false,
  kind: 'everyday',
  startAmount: 10_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 250_000_000,
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

const lendCat: CategoryView = {
  id: 'u-1:lend',
  type: 'expense',
  name: 'Cho vay',
  icon: 'hand-coins',
  parentId: null,
  sortOrder: 1,
  hidden: false,
};

const borrowCat: CategoryView = {
  id: 'u-1:borrow',
  type: 'income',
  name: 'Đi vay',
  icon: 'hand-coins',
  parentId: null,
  sortOrder: 2,
  hidden: false,
};

const categoriesResp: CategoriesResponse = {
  categories: [foodCat, lendCat, borrowCat],
  recentIds: ['cat-food'],
};

const meResp = {
  user: { id: 'u-1', email: 'an@example.com', name: 'An', consentAt: '2026-01-01T00:00:00Z' },
  personalArea: true,
  signIn: { zalo: false },
  mergeRequests: { incoming: [], outgoing: [], joining: [], claim: null },
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
      participantId: 'p-me',
      participantPending: false,
      isOrganiser: true,
    },
    people: [
      { id: 'p-me', name: 'An', status: 'active', isMember: true, bank: 'none' },
      { id: 'p-minh', name: 'Minh', status: 'active', isMember: false, bank: 'none' },
      { id: 'p-lan', name: 'Lan', status: 'active', isMember: false, bank: 'none' },
    ],
    balances: { 'p-me': 0, 'p-minh': 0, 'p-lan': 0 },
    suggestions: [],
    expenses: [],
    payments: [],
    myBalance: null,
    approvals: [],
    links: null,
  };
}

function baseRoutes(overrides: Record<string, unknown> = {}) {
  return {
    'GET /api/me': meResp,
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
    'GET /api/trips/t-led': directTripView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/people/candidates': [],
    'GET /api/me/personal/wallets': { wallets: [bankWallet, usdWallet] },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/tags': { tags: [] },
    'GET /api/me/personal/summary': {
      month: '2026-11',
      totalVnd: 2_000_000,
      spentVnd: 0,
      incomeVnd: 0,
      hasUnvaluedForeign: false,
    },
    'GET /api/me/personal/transactions': { rows: [] },
    'GET /api/me/people/summary': { people: [], incomplete: false },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/balance-checks': { walletIds: [] },
    ...overrides,
  };
}

function renderEntry(route = '/entries/new?type=loan-debt') {
  const result = renderAt(<App />, { route });
  act(() => {
    setLang('vi');
  });
  return result;
}

beforeEach(() => {
  localStorage.clear();
  hideUndo();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
});

describe('EntryPage — Vay/Nợ as a pure-loan form', () => {
  it('(a) Với ai: Minh, paid by you, 50k saves in 3 taps after amount with Cho vay and lend category', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(
      baseRoutes({
        'POST /api/trips/t-led/expenses': () =>
          Response.json({ expenseId: 'exp-loan-1' }, { status: 201 }),
        'PUT /api/me/personal/group-links/exp-loan-1': () =>
          Response.json({
            link: {
              walletId: 'w-bank',
              categoryId: 'u-1:lend',
              tagIds: [],
              intent: 'loan',
              excludeFromReports: false,
            },
          }),
      }),
    );

    renderEntry('/entries/new?type=loan-debt');

    // Type amount, then 3 interactions: (1) Xong, (2) Minh, (3) Lưu
    await finishAmount(user, '50000');
    expect(screen.getByTestId('entry-save-btn')).toBeDisabled();

    await pickPeople(user, ['Minh']);
    expect(screen.getByTestId('entry-outcome')).toHaveTextContent('Minh nợ bạn 50.000₫');
    expect(screen.getByTestId('entry-save-btn')).toBeEnabled();

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(
        calls.some((c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-loan-1'),
      ).toBe(true);
    });

    const postIdx = calls.findIndex(
      (c) => c.method === 'POST' && c.path === '/api/trips/t-led/expenses',
    );
    const putIdx = calls.findIndex(
      (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-loan-1',
    );
    expect(postIdx).toBeGreaterThanOrEqual(0);
    expect(putIdx).toBeGreaterThan(postIdx);

    expect(calls[postIdx]?.body).toMatchObject({
      description: 'Cho vay',
      amount: 50_000,
      payerId: 'p-me',
      mode: 'equal',
      entries: [{ participantId: 'p-minh', value: 1 }],
    });
    expect(calls[putIdx]?.body).toMatchObject({
      intent: 'loan',
      categoryId: 'u-1:lend',
      walletId: 'w-bank',
    });
  });

  it('(b) ⇄ flips payer to Minh, splits over me, links borrow category, and shows Bạn nợ Minh 50.000₫', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(
      baseRoutes({
        'POST /api/trips/t-led/expenses': () =>
          Response.json({ expenseId: 'exp-borrow-1' }, { status: 201 }),
        'PUT /api/me/personal/group-links/exp-borrow-1': () =>
          Response.json({
            link: {
              walletId: 'w-bank',
              categoryId: 'u-1:borrow',
              tagIds: [],
              intent: 'loan',
              excludeFromReports: false,
            },
          }),
      }),
    );

    renderEntry('/entries/new?type=loan-debt');
    await finishAmount(user, '50000');
    await pickPeople(user, ['Minh']);
    await user.click(await screen.findByTestId('entry-flip'));

    expect(screen.getByTestId('entry-outcome')).toHaveTextContent('Bạn nợ Minh 50.000₫');

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-borrow-1',
        ),
      ).toBe(true);
    });

    const postCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/trips/t-led/expenses',
    );
    const putCall = calls.find(
      (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-borrow-1',
    );
    expect(postCall?.body).toMatchObject({
      description: 'Đi vay',
      amount: 50_000,
      payerId: 'p-minh',
      mode: 'equal',
      entries: [{ participantId: 'p-me', value: 1 }],
    });
    expect(putCall?.body).toMatchObject({
      intent: 'loan',
      categoryId: 'u-1:borrow',
    });
  });

  it('(c) Minh and Lan, 100k names both in the sentence and hides entry-flip', async () => {
    const user = userEvent.setup();
    mockApi(baseRoutes());

    renderEntry('/entries/new?type=loan-debt');
    await finishAmount(user, '100000');
    await pickPeople(user, ['Minh']);
    await pickPeople(user, ['Lan']);

    const outcome = await screen.findByTestId('entry-outcome');
    expect(outcome).toHaveTextContent('Minh, Lan mỗi người nợ bạn 50.000₫');
    expect(screen.queryByTestId('entry-flip')).toBeNull();
  });

  it('(d) has no loan-debt-payer-row, no category picker, and note is optional with no placeholder', async () => {
    const user = userEvent.setup();
    mockApi(baseRoutes());

    renderEntry('/entries/new?type=loan-debt');
    await finishAmount(user, '50000');

    expect(screen.queryByTestId('loan-debt-payer-row')).toBeNull();
    expect(screen.queryByTestId('category-tile-cat-food')).toBeNull();
    expect(await screen.findByTestId('entry-people')).toHaveTextContent('Với ai?');

    await pickPeople(user, ['Minh']);
    expect(screen.getByTestId('entry-save-btn')).toBeEnabled();

    await openDetails(user);
    const noteInput = screen.getByTestId('entry-note-input');
    expect(noteInput).not.toHaveAttribute('placeholder');
  });

  it('(e) inside opened details, Ngày comes before Ghi chú in DOM order', async () => {
    const user = userEvent.setup();
    mockApi(baseRoutes());

    renderEntry('/entries/new?type=loan-debt');
    await finishAmount(user, '50000');
    await openDetails(user);

    const dateRow = screen.getByTestId('entry-date-row');
    const noteInput = screen.getByTestId('entry-note-input');
    expect(
      dateRow.compareDocumentPosition(noteInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('(f) wallet picker lists only VND wallets (no USD wallet)', async () => {
    const user = userEvent.setup();
    mockApi(baseRoutes());

    renderEntry('/entries/new?type=loan-debt');
    await finishAmount(user, '50000');
    await openDetails(user);
    await user.click(screen.getByTestId('entry-wallet-row'));

    const list = await screen.findByTestId('wallet-picker-list');
    expect(within(list).getByTestId('wallet-option-w-bank')).toBeInTheDocument();
    expect(within(list).queryByTestId('wallet-option-w-usd')).toBeNull();
  });

  it('(g) Chi → Vay/Nợ → Chi keeps 50k and Minh chosen, with ⇄ reset off', async () => {
    const user = userEvent.setup();
    mockApi(baseRoutes());

    renderEntry('/entries/new');
    await finishAmount(user, '50000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));
    await pickPeople(user, ['Minh']);
    await user.click(await screen.findByTestId('entry-flip'));
    expect(screen.getByTestId('entry-flip')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('entry-tab-loan-debt'));
    expect(await screen.findByTestId('entry-fold-amount')).toHaveTextContent('50.000₫');
    expect(screen.getByTestId('entry-people')).toHaveTextContent('Minh');
    expect(screen.getByTestId('entry-flip')).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByTestId('entry-tab-expense'));
    expect(await screen.findByTestId('entry-fold-amount')).toHaveTextContent('50.000₫');
    expect(screen.getByTestId('entry-people')).toHaveTextContent('Minh');
    expect(screen.getByTestId('entry-flip')).toHaveAttribute('aria-pressed', 'false');
  });

  it('(h) back with Minh chosen opens the leave guard modal', async () => {
    const user = userEvent.setup();
    mockApi(baseRoutes());

    renderEntry('/entries/new?type=loan-debt');
    await finishAmount(user, '50000');
    await pickPeople(user, ['Minh']);

    await user.click(screen.getByTestId('entry-back'));
    expect(await screen.findByTestId('leave-guard-discard')).toBeInTheDocument();
    expect(screen.getByTestId('leave-guard-keep')).toBeInTheDocument();
  });

  it('sends categoryId: null when lend/borrow categories are missing and shows InlineError on ledger failure', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(
      baseRoutes({
        'GET /api/me/personal/categories': { categories: [foodCat], recentIds: ['cat-food'] },
        'POST /api/trips/t-led/expenses': () =>
          Response.json({ expenseId: 'exp-no-cat' }, { status: 201 }),
        'PUT /api/me/personal/group-links/exp-no-cat': () =>
          Response.json({
            link: {
              walletId: 'w-bank',
              categoryId: null,
              tagIds: [],
              intent: 'loan',
              excludeFromReports: false,
            },
          }),
      }),
    );

    renderEntry('/entries/new?type=loan-debt');
    await finishAmount(user, '50000');
    await pickPeople(user, ['Minh']);
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-no-cat',
        ),
      ).toBe(true);
    });

    const putCall = calls.find(
      (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-no-cat',
    );
    expect(putCall?.body).toMatchObject({
      intent: 'loan',
      categoryId: null,
      walletId: 'w-bank',
    });
  });

  it('shows InlineError with retry when direct ledger fails on Vay/Nợ', async () => {
    mockApi(
      baseRoutes({
        'GET /api/me/ledger': () =>
          Response.json({ error: { code: 'INTERNAL', message: 'Ledger down' } }, { status: 500 }),
      }),
    );

    renderEntry('/entries/new?type=loan-debt');
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('a new account saves the borrow category even when the first category list predates the loan starters', async () => {
    const user = userEvent.setup();
    // The server creates "Cho vay" / "Đi vay" when group settings are first read; a category list loaded
    // before that has neither.
    let settingsRead = false;
    const { calls } = mockApi(
      baseRoutes({
        'GET /api/me/personal/group-settings': () => {
          settingsRead = true;
          return Response.json({ settings: { defaultGroupCategoryId: null, countLoans: false } });
        },
        'GET /api/me/personal/categories': () =>
          Response.json(
            settingsRead ? categoriesResp : { categories: [foodCat], recentIds: ['cat-food'] },
          ),
        'POST /api/trips/t-led/expenses': () =>
          Response.json({ expenseId: 'exp-new-acct' }, { status: 201 }),
        'PUT /api/me/personal/group-links/exp-new-acct': () =>
          Response.json({
            link: { walletId: 'w-bank', categoryId: 'u-1:borrow', tagIds: [], intent: 'loan', excludeFromReports: false },
          }),
      }),
    );

    renderEntry('/entries/new?type=loan-debt');
    await finishAmount(user, '50000');
    await pickPeople(user, ['Minh']);
    await user.click(screen.getByTestId('entry-flip'));
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(
        calls.some((c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-new-acct'),
      ).toBe(true);
    });
    const put = calls.find((c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-new-acct');
    expect(put?.body).toMatchObject({ intent: 'loan', categoryId: 'u-1:borrow' });
  });
});
