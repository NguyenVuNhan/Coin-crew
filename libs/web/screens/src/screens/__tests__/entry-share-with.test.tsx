import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CategoriesResponse,
  CategoryView,
  EntryView,
  SyncEntryRow,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import type { TxCopyStatus } from '@cc/web-data-access/txCopy/hooks';
import type { TxCopySnapshot } from '@cc/web-data-access/txCopy/store';
import { mockApi, renderAt } from '../../test/render';
import { finishAmount, openDetails, pickPeople } from '../../test/entry';
import { hideUndo } from '../../components/UndoSnackbarHost';
import { App } from '../../App';

let mockTxCopyState: { status: TxCopyStatus; snapshot: TxCopySnapshot | null } = {
  status: 'unavailable',
  snapshot: null,
};

vi.mock('@cc/web-data-access/txCopy/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-data-access/txCopy/hooks')>();
  return {
    ...actual,
    useTxCopy: () => mockTxCopyState,
  };
});

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

const coffeeCat: CategoryView = {
  id: 'cat-coffee',
  type: 'expense',
  name: 'Cà phê',
  icon: 'coffee',
  parentId: null,
  sortOrder: 1,
  hidden: false,
};

const categoriesResp: CategoriesResponse = {
  categories: [foodCat, coffeeCat],
  recentIds: ['cat-food', 'cat-coffee'],
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

function makeEntry(overrides: Partial<EntryView> = {}): EntryView {
  return {
    id: 'e-1',
    type: 'expense',
    walletId: 'w-bank',
    currency: 'VND',
    amount: 50_000,
    categoryId: 'cat-food',
    date: '2026-11-21',
    time: '08:30',
    note: null,
    tags: [],
    excludeFromReports: false,
    transferId: null,
    counterpartWalletId: null,
    source: 'manual',
    beforeStart: false,
    createdAt: '2026-11-21T01:30:00Z',
    ...overrides,
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

function renderNewEntry() {
  const result = renderAt(<App />, { route: '/entries/new' });
  act(() => {
    setLang('vi');
  });
  return result;
}

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  mockTxCopyState = { status: 'unavailable', snapshot: null };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  hideUndo();
});

describe('EntryPage — Chi with Chia với ai? and category guess', () => {
  it('(a) with no person, Lưu POSTs /api/me/personal/transactions as today', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(
      baseRoutes({
        'POST /api/me/personal/transactions': () =>
          Response.json({ entries: [makeEntry()] }, { status: 201 }),
      }),
    );

    renderNewEntry();
    await finishAmount(user, '50000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(
        calls.some((c) => c.method === 'POST' && c.path === '/api/me/personal/transactions'),
      ).toBe(true);
    });
    expect(calls.some((c) => c.method === 'POST' && c.path.includes('/expenses'))).toBe(false);
  });

  it('(b) 50k, pick Minh, Lưu posts expense then puts group link', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(
      baseRoutes({
        'POST /api/trips/t-led/expenses': () =>
          Response.json({ expenseId: 'exp-42' }, { status: 201 }),
        'PUT /api/me/personal/group-links/exp-42': () =>
          Response.json({
            link: {
              walletId: 'w-bank',
              categoryId: 'cat-food',
              tagIds: [],
              intent: 'shared',
              excludeFromReports: false,
            },
          }),
      }),
    );

    renderNewEntry();
    await finishAmount(user, '50000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));
    await pickPeople(user, ['Minh']);
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(
        calls.some((c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-42'),
      ).toBe(true);
    });

    const postIdx = calls.findIndex(
      (c) => c.method === 'POST' && c.path === '/api/trips/t-led/expenses',
    );
    const putIdx = calls.findIndex(
      (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-42',
    );
    expect(postIdx).toBeGreaterThanOrEqual(0);
    expect(putIdx).toBeGreaterThan(postIdx);

    expect(calls[postIdx]?.body).toMatchObject({
      description: 'Ăn uống',
      amount: 50_000,
      payerId: 'p-me',
      mode: 'equal',
      entries: [
        { participantId: 'p-me', value: 1 },
        { participantId: 'p-minh', value: 1 },
      ],
    });
    expect(calls[putIdx]?.body).toMatchObject({
      intent: 'shared',
      categoryId: 'cat-food',
      walletId: 'w-bank',
    });
  });

  it('(c) ⇄ makes payerId p-minh and shows "Minh trả · Bạn nợ Minh 25.000₫"', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(
      baseRoutes({
        'POST /api/trips/t-led/expenses': () =>
          Response.json({ expenseId: 'exp-99' }, { status: 201 }),
        'PUT /api/me/personal/group-links/exp-99': () =>
          Response.json({
            link: {
              walletId: 'w-bank',
              categoryId: 'cat-food',
              tagIds: [],
              intent: 'shared',
              excludeFromReports: false,
            },
          }),
      }),
    );

    renderNewEntry();
    await finishAmount(user, '50000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));
    await pickPeople(user, ['Minh']);

    await user.click(await screen.findByTestId('entry-flip'));
    expect(screen.getByTestId('entry-outcome')).toHaveTextContent(
      'Minh trả · Bạn nợ Minh 25.000₫',
    );

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(
        calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-led/expenses'),
      ).toBe(true);
    });
    const postCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/trips/t-led/expenses',
    );
    expect(postCall?.body).toMatchObject({ payerId: 'p-minh' });
  });

  it('(d) link PUT 500 shows alert; "Thử lại" PUTs again with exactly one POST to expenses', async () => {
    const user = userEvent.setup();
    let putAttempts = 0;
    const { calls } = mockApi(
      baseRoutes({
        'POST /api/trips/t-led/expenses': () =>
          Response.json({ expenseId: 'exp-retry' }, { status: 201 }),
        'PUT /api/me/personal/group-links/exp-retry': () => {
          putAttempts += 1;
          if (putAttempts === 1) {
            return Response.json(
              { error: { code: 'INTERNAL', message: 'Link failed' } },
              { status: 500 },
            );
          }
          return Response.json({
            link: {
              walletId: 'w-bank',
              categoryId: 'cat-food',
              tagIds: [],
              intent: 'shared',
              excludeFromReports: false,
            },
          });
        },
      }),
    );

    renderNewEntry();
    await finishAmount(user, '50000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));
    await pickPeople(user, ['Minh']);
    await user.click(screen.getByTestId('entry-save-btn'));

    const alert = await screen.findByRole('alert');
    const retryBtn = within(alert).getByRole('button', { name: 'Thử lại' });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(putAttempts).toBe(2);
    });

    const expensePosts = calls.filter(
      (c) => c.method === 'POST' && c.path === '/api/trips/t-led/expenses',
    );
    const linkPuts = calls.filter(
      (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-retry',
    );
    expect(expensePosts).toHaveLength(1);
    expect(linkPuts).toHaveLength(2);
  });

  it('(e) picking a USD wallet hides entry-people', async () => {
    const user = userEvent.setup();
    mockApi(baseRoutes());

    renderNewEntry();
    await finishAmount(user, '50000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));
    expect(await screen.findByTestId('entry-people')).toBeInTheDocument();

    await openDetails(user);
    await user.click(screen.getByTestId('entry-wallet-row'));
    await user.click(await screen.findByTestId('wallet-option-w-usd'));

    await waitFor(() => {
      expect(screen.queryByTestId('entry-people')).toBeNull();
    });
  });

  it('(f) GET /api/me/ledger 500 hides entry-people and plain save still works', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(
      baseRoutes({
        'GET /api/me/ledger': () =>
          Response.json({ error: { code: 'INTERNAL', message: 'Ledger down' } }, { status: 500 }),
        'POST /api/me/personal/transactions': () =>
          Response.json({ entries: [makeEntry()] }, { status: 201 }),
      }),
    );

    renderNewEntry();
    await finishAmount(user, '50000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));

    expect(screen.queryByTestId('entry-people')).toBeNull();

    await user.click(screen.getByTestId('entry-save-btn'));
    await waitFor(() => {
      expect(
        calls.some((c) => c.method === 'POST' && c.path === '/api/me/personal/transactions'),
      ).toBe(true);
    });
  });

  it('(g) stubbed useTxCopy with two 45k morning coffee entries at 8:00 guesses cat-coffee at 8:30 and Xong then Lưu saves cat-coffee', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 21, 8, 30, 0));

    const morningCoffeeEntries: SyncEntryRow[] = [
      {
        id: 'sync-1',
        walletId: 'w-bank',
        type: 'expense',
        amount: 45_000,
        categoryId: 'cat-coffee',
        assetId: null,
        quantity: null,
        transferId: null,
        counterpartWalletId: null,
        date: '2026-11-19',
        time: '08:00',
        note: null,
        tagIds: [],
        excludeFromReports: false,
        createdAt: '2026-11-19T01:00:00Z',
        syncVersion: 1,
      },
      {
        id: 'sync-2',
        walletId: 'w-bank',
        type: 'expense',
        amount: 45_000,
        categoryId: 'cat-coffee',
        assetId: null,
        quantity: null,
        transferId: null,
        counterpartWalletId: null,
        date: '2026-11-20',
        time: '08:00',
        note: null,
        tagIds: [],
        excludeFromReports: false,
        createdAt: '2026-11-20T01:00:00Z',
        syncVersion: 1,
      },
    ];

    mockTxCopyState = {
      status: 'ready',
      snapshot: {
        state: { format: 1, epoch: 'e1', version: 2, ledgerVersion: 0, ready: true },
        entries: morningCoffeeEntries,
        ledger: [],
      },
    };

    const user = userEvent.setup();
    const { calls } = mockApi(
      baseRoutes({
        'POST /api/me/personal/transactions': () =>
          Response.json(
            { entries: [makeEntry({ amount: 45_000, categoryId: 'cat-coffee' })] },
            { status: 201 },
          ),
      }),
    );

    renderNewEntry();
    await finishAmount(user, '45000');

    const coffeeTile = await screen.findByTestId('category-tile-cat-coffee');
    expect(coffeeTile).toHaveAttribute('data-guess', 'true');
    expect(coffeeTile).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(
        calls.some((c) => c.method === 'POST' && c.path === '/api/me/personal/transactions'),
      ).toBe(true);
    });
    const postCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/personal/transactions',
    );
    expect(postCall?.body).toMatchObject({
      amount: 45_000,
      categoryId: 'cat-coffee',
    });
  });

  it('(h) editing a direct shared expense inside Sổ chi tiêu (/entries/:id/edit?group=1) loads amount, note, people and PATCHes expense + PUTs link on save', async () => {
    const user = userEvent.setup();
    const viewWithExpense: TripView = {
      ...directTripView(),
      expenses: [
        {
          id: 'exp-shared-1',
          rootId: 'exp-shared-1',
          description: 'Bún chả trưa',
          amount: 80_000,
          spentOn: '2026-11-20',
          payerId: 'p-me',
          mode: 'equal',
          status: 'approved',
          rejectReason: null,
          disabledByName: null,
          createdById: 'p-me',
          shares: [
            { participantId: 'p-me', amount: 40_000, inputValue: 1 },
            { participantId: 'p-minh', amount: 40_000, inputValue: 1 },
          ],
        },
      ],
    };

    const { calls } = mockApi(
      baseRoutes({
        'GET /api/trips/t-led': viewWithExpense,
        'GET /api/me/personal/transactions': {
          rows: [],
          groupRows: [
            {
              kind: 'group',
              id: 'exp-shared-1',
              rootId: 'exp-shared-1',
              tripId: 't-led',
              tripName: 'Quick expenses',
              isDirect: true,
              source: 'expense',
              date: '2026-11-20',
              title: 'Bún chả trưa',
              total: 80_000,
              myShare: 40_000,
              iPaid: true,
              payerName: 'An',
              counterpartName: null,
              people: ['Minh'],
              pending: false,
              link: {
                walletId: 'w-bank',
                categoryId: 'cat-food',
                tagIds: [],
                intent: 'shared',
                excludeFromReports: false,
              },
              createdAt: '2026-11-20T05:00:00Z',
              activityAt: '2026-11-20T05:00:00Z',
            },
          ],
        },
        'PATCH /api/trips/t-led/expenses/exp-shared-1': () =>
          Response.json({ expenseId: 'exp-shared-2', rootId: 'exp-shared-1' }),
        'PUT /api/me/personal/group-links/exp-shared-1': () =>
          Response.json({
            link: {
              walletId: 'w-bank',
              categoryId: 'cat-coffee',
              tagIds: [],
              intent: 'shared',
              excludeFromReports: false,
            },
          }),
      }),
    );

    renderAt(<App />, { route: '/entries/exp-shared-1/edit?group=1' });
    act(() => {
      setLang('vi');
    });

    expect(await screen.findByTestId('entry-fold-amount')).toHaveTextContent('80.000₫');
    expect(screen.getByTestId('entry-note-input')).toHaveValue('Bún chả trưa');
    expect(screen.getByTestId('entry-people')).toHaveTextContent('Chia cho 2 người');
    expect(screen.getByTestId('entry-people')).toHaveTextContent('Bạn, Minh');
    expect(screen.getByTestId('entry-outcome')).toHaveTextContent(
      'Phần bạn 40.000₫ · Minh nợ bạn 40.000₫',
    );

    // Edit note and save
    await user.clear(screen.getByTestId('entry-note-input'));
    await user.type(screen.getByTestId('entry-note-input'), 'Bún chả chiều');
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.method === 'PATCH' && c.path === '/api/trips/t-led/expenses/exp-shared-1',
        ),
      ).toBe(true);
    });

    const patchCall = calls.find(
      (c) => c.method === 'PATCH' && c.path === '/api/trips/t-led/expenses/exp-shared-1',
    );
    expect(patchCall?.body).toMatchObject({
      description: 'Bún chả chiều',
      amount: 80_000,
      payerId: 'p-me',
      mode: 'equal',
      entries: [
        { participantId: 'p-me', value: 1 },
        { participantId: 'p-minh', value: 1 },
      ],
    });
    const putCall = calls.find(
      (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-shared-1',
    );
    expect(putCall?.body).toMatchObject({
      intent: 'shared',
      categoryId: 'cat-food',
      walletId: 'w-bank',
    });
  });

  it('(i) editing a direct loan inside Sổ chi tiêu (/entries/:id/edit?group=1) opens on Vay/Nợ with the loan split and PATCHes on save', async () => {
    const user = userEvent.setup();
    const viewWithLoan: TripView = {
      ...directTripView(),
      expenses: [
        {
          id: 'exp-loan-1',
          rootId: 'exp-loan-1',
          description: 'Cho vay',
          amount: 50_000,
          spentOn: '2026-11-20',
          payerId: 'p-me',
          mode: 'equal',
          status: 'approved',
          rejectReason: null,
          disabledByName: null,
          createdById: 'p-me',
          shares: [{ participantId: 'p-minh', amount: 50_000, inputValue: 1 }],
        },
      ],
    };

    const { calls } = mockApi(
      baseRoutes({
        'GET /api/trips/t-led': viewWithLoan,
        'GET /api/me/personal/transactions': {
          rows: [],
          groupRows: [
            {
              kind: 'group',
              id: 'exp-loan-1',
              rootId: 'exp-loan-1',
              tripId: 't-led',
              tripName: 'Quick expenses',
              isDirect: true,
              source: 'expense',
              date: '2026-11-20',
              title: 'Cho vay',
              total: 50_000,
              myShare: 0,
              iPaid: true,
              payerName: 'An',
              counterpartName: null,
              people: ['Minh'],
              pending: false,
              link: {
                walletId: 'w-bank',
                categoryId: null,
                tagIds: [],
                intent: 'loan',
                excludeFromReports: false,
              },
              createdAt: '2026-11-20T05:00:00Z',
              activityAt: '2026-11-20T05:00:00Z',
            },
          ],
        },
        'PATCH /api/trips/t-led/expenses/exp-loan-1': () =>
          Response.json({ expenseId: 'exp-loan-2', rootId: 'exp-loan-1' }),
        'PUT /api/me/personal/group-links/exp-loan-1': () =>
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

    renderAt(<App />, { route: '/entries/exp-loan-1/edit?group=1' });
    act(() => {
      setLang('vi');
    });

    expect(await screen.findByTestId('entry-fold-amount')).toHaveTextContent('50.000₫');
    expect(screen.getByTestId('entry-tab-loan-debt')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('entry-people')).toHaveTextContent('Với ai?');
    expect(screen.getByTestId('entry-people')).toHaveTextContent('Chia cho 1 người');
    expect(screen.getByTestId('entry-people')).toHaveTextContent('Minh');
    expect(screen.getByTestId('entry-outcome')).toHaveTextContent('Minh nợ bạn 50.000₫');

    // Flip to borrowed and save
    await user.click(screen.getByTestId('entry-flip'));
    expect(screen.getByTestId('entry-outcome')).toHaveTextContent('Bạn nợ Minh 50.000₫');
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.method === 'PATCH' && c.path === '/api/trips/t-led/expenses/exp-loan-1',
        ),
      ).toBe(true);
    });

    const patchCall = calls.find(
      (c) => c.method === 'PATCH' && c.path === '/api/trips/t-led/expenses/exp-loan-1',
    );
    expect(patchCall?.body).toMatchObject({
      amount: 50_000,
      payerId: 'p-minh',
      entries: [{ participantId: 'p-me', value: 1 }],
    });
  });
});
