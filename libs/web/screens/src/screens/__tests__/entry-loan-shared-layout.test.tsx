import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CategoriesResponse,
  CategoryView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { mockApi, renderAt } from '../../test/render';
import { finishAmount, pickPeople } from '../../test/entry';
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

const foodCat: CategoryView = {
  id: 'u-1:food',
  type: 'expense',
  name: 'Ăn uống',
  icon: 'utensils',
  parentId: null,
  sortOrder: 0,
  hidden: false,
  systemKey: 'food',
};

const foodDiningCat: CategoryView = {
  id: 'u-1:food-dining',
  type: 'expense',
  name: 'Ăn ngoài',
  icon: 'utensils-crossed',
  parentId: 'u-1:food',
  sortOrder: 0,
  hidden: false,
  systemKey: 'food-dining',
};

const lendCat: CategoryView = {
  id: 'u-1:lend',
  type: 'expense',
  name: 'Cho vay',
  icon: 'hand-coins',
  parentId: null,
  sortOrder: 1,
  hidden: false,
  systemKey: 'lend',
};

const borrowCat: CategoryView = {
  id: 'u-1:borrow',
  type: 'income',
  name: 'Đi vay',
  icon: 'handshake',
  parentId: null,
  sortOrder: 2,
  hidden: false,
  systemKey: 'borrow',
};

const categoriesResp: CategoriesResponse = {
  categories: [foodCat, foodDiningCat, lendCat, borrowCat],
  recentIds: ['u-1:food-dining'],
};

const meResp = {
  user: { id: 'u-1', email: 'an@example.com', name: 'An', consentAt: '2026-01-01T00:00:00Z' },
  personalArea: true,
  signIn: { zalo: false },
  mergeRequests: { incoming: [], outgoing: [], joining: [], claim: null },
};

function directTripView(overrides: Partial<TripView> = {}): TripView {
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
    'GET /api/me/personal/wallets': { wallets: [bankWallet] },
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

describe('EntryPage — Vay/Nợ shared expense layout', () => {
  it('Vay/Nợ shows title, amount, payer+date, people, Nội dung', async () => {
    const user = userEvent.setup();
    mockApi(baseRoutes());

    renderEntry('/entries/new?type=loan-debt');
    await finishAmount(user, '50000');

    const titleInput = screen.getByTestId('entry-note-input');
    const categoryBtn = screen.getByTestId('shared-category-btn');
    const amountFold = screen.getByTestId('entry-fold-amount');
    const detailsCard = screen.getByTestId('shared-details-card');
    const payerRow = screen.getByTestId('shared-payer-row');
    const dateRow = screen.getByTestId('entry-date-row');
    const walletRow = screen.getByTestId('entry-wallet-row');
    const people = screen.getByTestId('entry-people');
    const noteInput = screen.getByTestId('shared-note-input');

    expect(categoryBtn).toHaveAttribute('data-icon', 'tag');
    expect(payerRow).toBeVisible();
    expect(dateRow).toBeVisible();
    expect(walletRow).toBeVisible();
    expect(screen.queryByTestId('entry-fold-details')).toBeNull();

    // Order: title → amount → details (payer + date + wallet) → people → Nội dung
    expect(
      titleInput.compareDocumentPosition(amountFold) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      amountFold.compareDocumentPosition(detailsCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      detailsCard.compareDocumentPosition(people) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      people.compareDocumentPosition(noteInput) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('loan category follows flip until a danh mục is picked', async () => {
    const user = userEvent.setup();

    // 1. No pick, paid by me → link categoryId is :lend, categoryKey is null
    {
      const { calls, unmount } = (() => {
        const api = mockApi(
          baseRoutes({
            'POST /api/trips/t-led/expenses': () =>
              Response.json({ expenseId: 'exp-1' }, { status: 201 }),
            'PUT /api/me/personal/group-links/exp-1': () =>
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
        const r = renderEntry('/entries/new?type=loan-debt');
        return { calls: api.calls, unmount: r.unmount };
      })();

      await finishAmount(user, '50000');
      await user.type(screen.getByTestId('entry-note-input'), 'Ứng tiền ăn');
      await pickPeople(user, ['Minh']);
      await user.click(screen.getByTestId('entry-save-btn'));

      await waitFor(() => {
        expect(
          calls.some((c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-1'),
        ).toBe(true);
      });

      const post1 = calls.find((c) => c.method === 'POST' && c.path === '/api/trips/t-led/expenses');
      const put1 = calls.find((c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-1');
      expect(post1?.body).toMatchObject({
        description: 'Ứng tiền ăn',
        categoryKey: null,
        note: null,
        payerId: 'p-me',
      });
      expect(put1?.body).toMatchObject({
        intent: 'loan',
        categoryId: 'u-1:lend',
      });
      unmount();
    }

    // 2. No pick, flip payer to Minh via PayerSheet → link categoryId is :borrow, categoryKey is null
    {
      const api = mockApi(
        baseRoutes({
          'POST /api/trips/t-led/expenses': () =>
            Response.json({ expenseId: 'exp-2' }, { status: 201 }),
          'PUT /api/me/personal/group-links/exp-2': () =>
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
      const { unmount } = renderEntry('/entries/new?type=loan-debt');

      await finishAmount(user, '50000');
      await user.type(screen.getByTestId('entry-note-input'), 'Vay tiền ăn');
      await pickPeople(user, ['Minh']);
      await user.click(screen.getByTestId('shared-payer-row'));
      await user.click(await screen.findByTestId('payer-option-p-minh'));
      expect(screen.getByTestId('entry-outcome')).toHaveTextContent('Bạn nợ Minh 50.000₫');
      await user.click(screen.getByTestId('entry-save-btn'));

      await waitFor(() => {
        expect(
          api.calls.some((c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-2'),
        ).toBe(true);
      });

      const post2 = api.calls.find((c) => c.method === 'POST' && c.path === '/api/trips/t-led/expenses');
      const put2 = api.calls.find((c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-2');
      expect(post2?.body).toMatchObject({
        description: 'Vay tiền ăn',
        categoryKey: null,
        payerId: 'p-minh',
      });
      expect(put2?.body).toMatchObject({
        intent: 'loan',
        categoryId: 'u-1:borrow',
      });
      unmount();
    }

    // 3. Pick Ăn ngoài → link categoryId is :food-dining and categoryKey is 'food-dining'
    {
      const api = mockApi(
        baseRoutes({
          'POST /api/trips/t-led/expenses': () =>
            Response.json({ expenseId: 'exp-3' }, { status: 201 }),
          'PUT /api/me/personal/group-links/exp-3': () =>
            Response.json({
              link: {
                walletId: 'w-bank',
                categoryId: 'u-1:food-dining',
                tagIds: [],
                intent: 'loan',
                excludeFromReports: false,
              },
            }),
        }),
      );
      const { unmount } = renderEntry('/entries/new?type=loan-debt');

      await finishAmount(user, '50000');
      await user.type(screen.getByTestId('entry-note-input'), 'Ăn tối');
      await user.type(screen.getByTestId('shared-note-input'), 'Quán nướng');
      await pickPeople(user, ['Minh']);
      await user.click(screen.getByTestId('shared-category-btn'));
      await user.click(await screen.findByTestId('danh-muc-option-food-dining'));
      expect(screen.getByTestId('shared-category-btn')).toHaveAttribute('data-icon', 'utensils-crossed');

      await user.click(screen.getByTestId('entry-save-btn'));

      await waitFor(() => {
        expect(
          api.calls.some((c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-3'),
        ).toBe(true);
      });

      const post3 = api.calls.find((c) => c.method === 'POST' && c.path === '/api/trips/t-led/expenses');
      const put3 = api.calls.find((c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-3');
      expect(post3?.body).toMatchObject({
        description: 'Ăn tối',
        categoryKey: 'food-dining',
        note: 'Quán nướng',
      });
      expect(put3?.body).toMatchObject({
        intent: 'loan',
        categoryId: 'u-1:food-dining',
      });
      unmount();
    }

    // 4. Pick Ăn ngoài then Clear → returns to :lend and categoryKey null
    {
      const api = mockApi(
        baseRoutes({
          'POST /api/trips/t-led/expenses': () =>
            Response.json({ expenseId: 'exp-4' }, { status: 201 }),
          'PUT /api/me/personal/group-links/exp-4': () =>
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
      const { unmount } = renderEntry('/entries/new?type=loan-debt');

      await finishAmount(user, '50000');
      await user.type(screen.getByTestId('entry-note-input'), 'Trả hộ');
      await pickPeople(user, ['Minh']);
      await user.click(screen.getByTestId('shared-category-btn'));
      await user.click(await screen.findByTestId('danh-muc-option-food-dining'));
      await user.click(screen.getByTestId('shared-category-btn'));
      await user.click(await screen.findByTestId('danh-muc-clear'));
      expect(screen.getByTestId('shared-category-btn')).toHaveAttribute('data-icon', 'tag');

      await user.click(screen.getByTestId('entry-save-btn'));

      await waitFor(() => {
        expect(
          api.calls.some((c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-4'),
        ).toBe(true);
      });

      const post4 = api.calls.find((c) => c.method === 'POST' && c.path === '/api/trips/t-led/expenses');
      const put4 = api.calls.find((c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-4');
      expect(post4?.body).toMatchObject({
        description: 'Trả hộ',
        categoryKey: null,
      });
      expect(put4?.body).toMatchObject({
        intent: 'loan',
        categoryId: 'u-1:lend',
      });
      unmount();
    }
  }, 30000);

  it('an empty title falls back to Cho vay, so a quick loan still saves', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(
      baseRoutes({
        'POST /api/trips/t-led/expenses': () =>
          Response.json({ expenseId: 'exp-title' }, { status: 201 }),
      }),
    );

    renderEntry('/entries/new?type=loan-debt');
    await finishAmount(user, '50000');
    await pickPeople(user, ['Minh']);

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.path === '/api/trips/t-led/expenses');
      expect(post?.body).toMatchObject({ description: 'Cho vay', categoryKey: null });
    });
  });

  it('edit of an existing Cho vay loan opens with no danh mục and the flip works', async () => {
    const user = userEvent.setup();
    const viewWithLoan = directTripView({
      expenses: [
        {
          id: 'exp-loan-edit',
          rootId: 'exp-loan-edit',
          description: 'Ứng tiền sân',
          categoryKey: null,
          note: 'Trả tuần sau',
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
    });

    const { calls } = mockApi(
      baseRoutes({
        'GET /api/trips/t-led': viewWithLoan,
        'GET /api/me/personal/transactions': {
          rows: [],
          groupRows: [
            {
              kind: 'group',
              id: 'exp-loan-edit',
              rootId: 'exp-loan-edit',
              tripId: 't-led',
              tripName: 'Quick expenses',
              isDirect: true,
              source: 'expense',
              date: '2026-11-20',
              title: 'Ứng tiền sân',
              total: 50_000,
              myShare: 0,
              iPaid: true,
              payerName: 'An',
              counterpartName: null,
              people: ['Minh'],
              pending: false,
              groupCategoryId: null,
              link: {
                walletId: 'w-bank',
                categoryId: 'u-1:lend',
                tagIds: [],
                intent: 'loan',
                excludeFromReports: false,
              },
              createdAt: '2026-11-20T05:00:00Z',
              activityAt: '2026-11-20T05:00:00Z',
            },
          ],
        },
        'PATCH /api/trips/t-led/expenses/exp-loan-edit': () =>
          Response.json({ expenseId: 'exp-loan-edit-v2', rootId: 'exp-loan-edit' }),
        'PUT /api/me/personal/group-links/exp-loan-edit': () =>
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

    renderEntry('/entries/exp-loan-edit/edit?group=1');

    await waitFor(() => expect(screen.getByTestId('entry-note-input')).toHaveValue('Ứng tiền sân'));
    expect(screen.getByTestId('shared-note-input')).toHaveValue('Trả tuần sau');
    expect(screen.getByTestId('shared-category-btn')).toHaveAttribute('data-icon', 'tag');
    expect(screen.getByTestId('entry-outcome')).toHaveTextContent('Minh nợ bạn 50.000₫');

    // Flip payer to Minh via PayerSheet
    await user.click(screen.getByTestId('shared-payer-row'));
    await user.click(await screen.findByTestId('payer-option-p-minh'));
    expect(screen.getByTestId('entry-outcome')).toHaveTextContent('Bạn nợ Minh 50.000₫');

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-loan-edit',
        ),
      ).toBe(true);
    });

    const patchCall = calls.find(
      (c) => c.method === 'PATCH' && c.path === '/api/trips/t-led/expenses/exp-loan-edit',
    );
    const putCall = calls.find(
      (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-loan-edit',
    );
    expect(patchCall?.body).toMatchObject({
      description: 'Ứng tiền sân',
      categoryKey: null,
      note: 'Trả tuần sau',
      amount: 50_000,
      payerId: 'p-minh',
      entries: [{ participantId: 'p-me', value: 1 }],
    });
    expect(putCall?.body).toMatchObject({
      intent: 'loan',
      categoryId: 'u-1:borrow',
    });
  });
});
