import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CategoriesResponse,
  CategoryView,
  GroupRow,
  TagView,
  WalletDetailView,
} from '@cc/core';
import { mockApi, renderAt } from '../../test/render';
import { GroupRowSheet } from '../GroupRowSheet';

afterEach(() => {
  vi.unstubAllGlobals();
});

const vndDefault: WalletDetailView = {
  id: 'w-tcb',
  name: 'Techcombank',
  currency: 'VND',
  balance: 4_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 4_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 4_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 0,
};

const vndCash: WalletDetailView = {
  id: 'w-cash',
  name: 'Tiền mặt',
  currency: 'VND',
  balance: 500_000,
  isDefault: false,
  kind: 'everyday',
  startAmount: 500_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 500_000,
  icon: null,
  sortOrder: 1,
  archived: false,
  entryCount: 0,
};

const vndArchived: WalletDetailView = {
  id: 'w-arch',
  name: 'Old VND',
  currency: 'VND',
  balance: 0,
  isDefault: false,
  kind: 'everyday',
  startAmount: 0,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 0,
  icon: null,
  sortOrder: 2,
  archived: true,
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
  sortOrder: 3,
  archived: false,
  entryCount: 0,
};

const CATEGORIES: CategoryView[] = [
  { id: 'c-food', parentId: null, type: 'expense', name: 'Food', icon: 'utensils', hidden: false, sortOrder: 0 },
  { id: 'c-travel', parentId: null, type: 'expense', name: 'Travel', icon: 'plane', hidden: false, sortOrder: 1 },
  { id: 'c-group', parentId: null, type: 'expense', name: 'Nhóm', icon: 'users', hidden: false, sortOrder: 2 },
];

const CATEGORIES_RES: CategoriesResponse = {
  categories: CATEGORIES,
  recentIds: ['c-food'],
};

const TAGS: TagView[] = [
  { id: 't-dalat', name: 'dalat', useCount: 4 },
  { id: 't-dinner', name: 'dinner', useCount: 2 },
];

function makeRow(overrides: Partial<GroupRow> = {}): GroupRow {
  return {
    kind: 'group',
    activityAt: '2026-11-01T00:00:00.000Z',
    id: 'tx-1',
    rootId: 'root-1',
    tripId: 'trip-dl',
    tripName: 'Đà Lạt',
    isDirect: false,
    source: 'expense',
    date: '2026-11-15',
    title: 'Lẩu tối',
    total: 300_000,
    myShare: 100_000,
    iPaid: true,
    payerName: 'Nhan',
    counterpartName: null,
    people: ['Minh', 'Lan'],
    pending: false,
    link: null,
    createdAt: '2026-11-15T12:00:00Z',
    ...overrides,
  };
}

function setupApi(overrides: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/me/personal/wallets': {
      wallets: [vndDefault, vndCash, vndArchived, usdWallet],
    },
    'GET /api/me/personal/categories': CATEGORIES_RES,
    'GET /api/me/personal/tags': { tags: TAGS },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'PUT /api/me/personal/group-links/root-1': (init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      return Response.json({
        link: {
          walletId: body.walletId ?? null,
          categoryId: body.categoryId ?? null,
          tagIds: body.tagIds ?? [],
          intent: body.intent ?? null,
          excludeFromReports: Boolean(body.excludeFromReports),
        },
      });
    },
    ...overrides,
  });
}

describe('GroupRowSheet', () => {
  it('sets category and sends PUT with { categoryId }', async () => {
    const user = userEvent.setup();
    const { calls } = setupApi();
    const row = makeRow();

    renderAt(<GroupRowSheet row={row} open onClose={vi.fn()} />);

    const sheet = await screen.findByTestId('group-row-sheet');
    expect(sheet).toHaveTextContent('Đà Lạt');
    expect(sheet).toHaveTextContent('Your share 100.000₫');
    expect(sheet).toHaveTextContent('Minh, Lan each owe you 100.000₫');
    expect(sheet).toHaveTextContent('Amount and people are edited in the group.');

    await user.click(screen.getByTestId('group-row-field-category'));
    await user.click(await screen.findByTestId('category-tile-c-food'));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PUT',
        path: '/api/me/personal/group-links/root-1',
        body: { categoryId: 'c-food' },
      }),
    );
  });

  it('wallet picker lists VND wallets only', async () => {
    const user = userEvent.setup();
    const { calls } = setupApi();
    const row = makeRow();

    renderAt(<GroupRowSheet row={row} open onClose={vi.fn()} />);

    await screen.findByTestId('group-row-sheet');
    await user.click(screen.getByTestId('group-row-field-wallet'));

    const picker = await screen.findByTestId('group-row-wallet-picker');
    expect(await within(picker).findByTestId('group-row-wallet-option-w-tcb')).toBeInTheDocument();
    expect(within(picker).getByTestId('group-row-wallet-option-w-cash')).toBeInTheDocument();
    expect(within(picker).queryByTestId('group-row-wallet-option-w-usd')).not.toBeInTheDocument();
    expect(within(picker).queryByTestId('group-row-wallet-option-w-arch')).not.toBeInTheDocument();

    await user.click(within(picker).getByTestId('group-row-wallet-option-w-cash'));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PUT',
        path: '/api/me/personal/group-links/root-1',
        body: { walletId: 'w-cash' },
      }),
    );
  });

  it('tags replace the set via PUT with { tagIds }', async () => {
    const user = userEvent.setup();
    const { calls } = setupApi();
    const row = makeRow({
      link: {
        walletId: null,
        categoryId: null,
        tagIds: ['t-dalat'],
        intent: null,
        excludeFromReports: false,
      },
    });

    renderAt(<GroupRowSheet row={row} open onClose={vi.fn()} />);

    await screen.findByTestId('group-row-sheet');
    await user.click(screen.getByTestId('group-row-field-tags'));

    const dalatChip = await screen.findByTestId('tag-chip-dalat');
    const input = await screen.findByTestId('tag-input-field');
    await user.type(input, 'dinner{Enter}');

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PUT',
        path: '/api/me/personal/group-links/root-1',
        body: { tagIds: ['t-dalat', 't-dinner'] },
      }),
    );

    await user.click(within(dalatChip).getByRole('button'));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PUT',
        path: '/api/me/personal/group-links/root-1',
        body: { tagIds: ['t-dinner'] },
      }),
    );
  });

  it('report switch saves excludeFromReports and shows InlineError on failure', async () => {
    const user = userEvent.setup();
    let shouldFail = false;
    const { calls } = setupApi({
      'PUT /api/me/personal/group-links/root-1': (init?: RequestInit) => {
        if (shouldFail) {
          return Response.json(
            { error: { code: 'SERVER_ERROR', message: 'Boom' } },
            { status: 500 },
          );
        }
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return Response.json({
          link: {
            walletId: null,
            categoryId: null,
            tagIds: [],
            intent: null,
            excludeFromReports: Boolean(body.excludeFromReports),
          },
        });
      },
    });
    const row = makeRow();

    renderAt(<GroupRowSheet row={row} open onClose={vi.fn()} />);

    const sw = await screen.findByTestId('group-row-exclude-switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');

    await user.click(sw);

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PUT',
        path: '/api/me/personal/group-links/root-1',
        body: { excludeFromReports: true },
      }),
    );
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));

    shouldFail = true;
    await user.click(sw);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('"Open in the group" link target matches each source', async () => {
    setupApi();

    const expenseRow = makeRow({ id: 'exp-1', tripId: 'trip-a', source: 'expense' });
    const { unmount: unmount1 } = renderAt(
      <GroupRowSheet row={expenseRow} open onClose={vi.fn()} />,
    );
    const expenseLink = await screen.findByTestId('group-row-open-in-group');
    expect(expenseLink).toHaveAttribute('href', '/t/trip-a/expenses/exp-1');
    unmount1();

    const paymentRow = makeRow({
      id: 'pay-2',
      tripId: 'trip-b',
      source: 'payment',
      iPaid: false,
      counterpartName: 'Minh',
      total: 200_000,
      myShare: 0,
    });
    const { unmount: unmount2 } = renderAt(
      <GroupRowSheet row={paymentRow} open onClose={vi.fn()} />,
    );
    const paymentLink = await screen.findByTestId('group-row-open-in-group');
    expect(paymentLink).toHaveAttribute('href', '/t/trip-b/payments/pay-2');
    expect(screen.getByTestId('group-row-outcome')).toHaveTextContent('Minh paid you · 200.000₫');
    unmount2();

    const fundRow = makeRow({
      id: 'fund-3',
      tripId: 'trip-c',
      source: 'fund',
      total: 500_000,
      myShare: 500_000,
    });
    renderAt(<GroupRowSheet row={fundRow} open onClose={vi.fn()} />);
    const fundLink = await screen.findByTestId('group-row-open-in-group');
    expect(fundLink).toHaveAttribute('href', '/t/trip-c/fund/fund-3');
    expect(screen.getByTestId('group-row-outcome')).toHaveTextContent('Into the group fund · 500.000₫');
  });

  it('has no amount field', async () => {
    setupApi();
    const row = makeRow();

    renderAt(<GroupRowSheet row={row} open onClose={vi.fn()} />);

    const sheet = await screen.findByTestId('group-row-sheet');
    expect(sheet.querySelector('input[type="number"]')).toBeNull();
    expect(sheet.querySelector('input[inputmode="numeric"]')).toBeNull();
    expect(within(sheet).queryByLabelText(/amount|số tiền/i)).toBeNull();
  });

  it('for a direct quick expense, hides editInGroup notice and links Edit to /entries/:rootId/edit?group=1', async () => {
    setupApi();
    const directRow = makeRow({
      id: 'exp-head-2',
      rootId: 'exp-root-1',
      tripId: 't-led',
      tripName: 'Quick expenses',
      isDirect: true,
      source: 'expense',
    });

    renderAt(<GroupRowSheet row={directRow} open onClose={vi.fn()} />);

    const sheet = await screen.findByTestId('group-row-sheet');
    expect(sheet).not.toHaveTextContent('Amount and people are edited in the group.');

    const editLink = await screen.findByTestId('group-row-open-in-group');
    expect(editLink).toHaveTextContent(/^Edit$/);
    expect(editLink).toHaveAttribute('href', '/entries/exp-root-1/edit?group=1');
    expect(screen.getByTestId('group-row-delete')).toHaveTextContent(/^Delete$/);
  });

  it('deletes a direct quick expense after confirmation and hides delete for regular group rows', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { calls } = setupApi({
      'DELETE /api/trips/t-led/expenses/exp-head-2': () => new Response(null, { status: 204 }),
    });

    const regularRow = makeRow({ id: 'exp-reg', tripId: 'trip-a', isDirect: false, source: 'expense' });
    const { unmount } = renderAt(<GroupRowSheet row={regularRow} open onClose={onClose} />);
    await screen.findByTestId('group-row-sheet');
    expect(screen.queryByTestId('group-row-delete')).not.toBeInTheDocument();
    unmount();

    const directRow = makeRow({
      id: 'exp-head-2',
      rootId: 'exp-root-1',
      tripId: 't-led',
      tripName: 'Quick expenses',
      isDirect: true,
      source: 'expense',
    });
    renderAt(<GroupRowSheet row={directRow} open onClose={onClose} />);

    await screen.findByTestId('group-row-sheet');
    await user.click(screen.getByTestId('group-row-delete'));
    expect(
      await screen.findByText('This expense will be deleted right away and cannot be undone.'),
    ).toBeInTheDocument();
    const confirmBtn = await screen.findByTestId('group-row-delete-confirm');
    await user.click(confirmBtn);

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'DELETE',
        path: '/api/trips/t-led/expenses/exp-head-2',
        body: undefined,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('colors outcome banner by direction (danger when you owe, success when owed, muted for payment, warning when pending) and shows before-start pill', async () => {
    setupApi();

    const { unmount: u1 } = renderAt(
      <GroupRowSheet
        row={makeRow({ iPaid: false, payerName: 'Thủy', myShare: 41_669, total: 125_000 })}
        open
        onClose={vi.fn()}
      />,
    );
    const owedBanner = await screen.findByTestId('group-row-outcome');
    expect(owedBanner).toHaveClass('bg-danger-soft', 'text-danger');
    u1();

    const { unmount: u2 } = renderAt(
      <GroupRowSheet
        row={makeRow({ iPaid: true, myShare: 100_000, total: 300_000 })}
        open
        onClose={vi.fn()}
      />,
    );
    const oweMeBanner = await screen.findByTestId('group-row-outcome');
    expect(oweMeBanner).toHaveClass('bg-success-soft', 'text-success');
    u2();

    const { unmount: u3 } = renderAt(
      <GroupRowSheet
        row={makeRow({ source: 'payment', iPaid: false, counterpartName: 'Minh', total: 200_000, myShare: 0 })}
        open
        onClose={vi.fn()}
      />,
    );
    const payBanner = await screen.findByTestId('group-row-outcome');
    expect(payBanner).toHaveClass('bg-muted', 'text-foreground');
    u3();

    renderAt(
      <GroupRowSheet
        row={makeRow({ pending: true, date: '2025-12-15' })}
        open
        onClose={vi.fn()}
      />,
    );
    const pendingBanner = await screen.findByTestId('group-row-outcome');
    expect(pendingBanner).toHaveClass('bg-warning-soft', 'text-warning-foreground');
    expect(await screen.findByText('Before wallet start date')).toBeInTheDocument();
  });
});
