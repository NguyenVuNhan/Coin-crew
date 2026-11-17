import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoryView, EntryView, ListRow, TagView, WalletDetailView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { App } from '../../App';
import { hideUndo } from '../../components/UndoSnackbarHost';

beforeEach(() => {
  localStorage.clear();
  hideUndo();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
});

const meOn = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: true,
};

const wallets: WalletDetailView[] = [
  {
    id: 'w-cash',
    name: 'Tiền mặt',
    kind: 'everyday',
    currency: 'VND',
    balance: 2000000,
    startAmount: 2000000,
    startDate: '2026-11-01',
    startCostVnd: null,
    vndValue: 2000000,
    icon: 'bg-avatar-1',
    sortOrder: 0,
    archived: false,
    isDefault: true,
    entryCount: 3,
  },
  {
    id: 'w-usd',
    name: 'USD Wallet',
    kind: 'everyday',
    currency: 'USD',
    balance: 10000,
    startAmount: 10000,
    startDate: '2026-11-01',
    startCostVnd: 2500000,
    vndValue: 2500000,
    icon: 'bg-avatar-2',
    sortOrder: 1,
    archived: false,
    isDefault: false,
    entryCount: 1,
  },
];

const categories: CategoryView[] = [
  {
    id: 'cat-food',
    parentId: null,
    type: 'expense',
    name: 'Food',
    icon: 'receipt',
    hidden: false,
    sortOrder: 0,
  },
  {
    id: 'cat-salary',
    parentId: null,
    type: 'income',
    name: 'Salary',
    icon: 'wallet',
    hidden: false,
    sortOrder: 1,
  },
];

const tags: TagView[] = [
  { id: 'tag-coffee', name: 'coffee', useCount: 1 },
];

const entryExpense: EntryView = {
  id: 'e-1',
  walletId: 'w-cash',
  type: 'expense',
  amount: 50000,
  currency: 'VND',
  categoryId: 'cat-food',
  transferId: null,
  counterpartWalletId: null,
  date: '2026-11-16',
  time: '09:00',
  note: 'Bánh mì',
  tags: ['coffee'],
  excludeFromReports: false,
  source: 'manual',
  beforeStart: false,
  createdAt: '2026-11-16T09:00:00.000Z',
};

const entryIncome: EntryView = {
  id: 'e-2',
  walletId: 'w-cash',
  type: 'income',
  amount: 500000,
  currency: 'VND',
  categoryId: 'cat-salary',
  transferId: null,
  counterpartWalletId: null,
  date: '2026-11-16',
  time: null,
  note: 'Bonus',
  tags: [],
  excludeFromReports: false,
  source: 'manual',
  beforeStart: false,
  createdAt: '2026-11-16T08:00:00.000Z',
};

const entryBeforeStart: EntryView = {
  id: 'e-3',
  walletId: 'w-usd',
  type: 'expense',
  amount: 1250,
  currency: 'USD',
  categoryId: 'cat-food',
  transferId: null,
  counterpartWalletId: null,
  date: '2026-10-20',
  time: null,
  note: 'Old snack',
  tags: [],
  excludeFromReports: false,
  source: 'manual',
  beforeStart: true,
  createdAt: '2026-10-20T10:00:00.000Z',
};

const transferOut: EntryView = {
  id: 'e-t-out',
  walletId: 'w-cash',
  type: 'transfer_out',
  amount: 250000,
  currency: 'VND',
  categoryId: null,
  transferId: 'tr-1',
  counterpartWalletId: 'w-usd',
  date: '2026-11-15',
  time: null,
  note: null,
  tags: [],
  excludeFromReports: true,
  source: 'manual',
  beforeStart: false,
  createdAt: '2026-11-15T12:00:00.000Z',
};

const transferIn: EntryView = {
  id: 'e-t-in',
  walletId: 'w-usd',
  type: 'transfer_in',
  amount: 1000,
  currency: 'USD',
  categoryId: null,
  transferId: 'tr-1',
  counterpartWalletId: 'w-cash',
  date: '2026-11-15',
  time: null,
  note: null,
  tags: [],
  excludeFromReports: true,
  source: 'manual',
  beforeStart: false,
  createdAt: '2026-11-15T12:00:00.000Z',
};

const personRow: ListRow = {
  kind: 'person',
  id: 'e-taxi',
  tripId: 't-led',
  date: '2026-11-14',
  share: 120000,
  total: 240000,
  note: 'Taxi',
  people: ['Minh'],
  walletId: 'w-cash',
  currency: 'VND',
  createdAt: '2026-11-14T15:00:00.000Z',
};

function setupMock(initialRows: ListRow[] = [
  { kind: 'entry', entry: entryExpense },
  { kind: 'entry', entry: entryIncome },
  { kind: 'entry', entry: transferOut },
  { kind: 'entry', entry: transferIn },
  personRow,
  { kind: 'entry', entry: entryBeforeStart },
]) {
  let rows = [...initialRows];

  const api = mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/wallets': { wallets },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/summary': {
      month: '2026-11',
      totalVnd: 4500000,
      approximate: true,
      byCurrency: [],
      spent: [],
      income: [],
    },
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
    'GET /api/me/people/summary': { people: [], incomplete: false },
    'GET /api/me/personal/transactions': (_init: RequestInit | undefined, url: string) => {
      const parsed = new URL(url, 'http://localhost');
      const q = parsed.searchParams.get('q');
      const walletId = parsed.searchParams.get('walletId');
      const type = parsed.searchParams.get('type');
      let filtered = rows;
      if (q) {
        filtered = filtered.filter((r) =>
          (r.kind === 'entry' ? r.entry.note ?? '' : r.note)
            .toLowerCase()
            .includes(q.toLowerCase()),
        );
      }
      if (walletId) {
        filtered = filtered.filter((r) =>
          r.kind === 'entry' ? r.entry.walletId === walletId : r.walletId === walletId,
        );
      }
      if (type) {
        filtered = filtered.filter((r) => {
          if (type === 'person') return r.kind === 'person';
          if (r.kind !== 'entry') return false;
          if (type === 'transfer') {
            return r.entry.type === 'transfer_in' || r.entry.type === 'transfer_out';
          }
          return r.entry.type === type;
        });
      }
      return Response.json({ rows: filtered, totals: [] });
    },
    'DELETE /api/me/personal/transactions/e-1': () => {
      rows = rows.filter((r) => !(r.kind === 'entry' && r.entry.id === 'e-1'));
      return Response.json({ entries: [entryExpense] });
    },
    'DELETE /api/me/personal/transactions/e-t-out': () => {
      rows = rows.filter(
        (r) => !(r.kind === 'entry' && r.entry.transferId === 'tr-1'),
      );
      return Response.json({ entries: [transferOut, transferIn] });
    },
    'POST /api/me/personal/transactions/restore': (init: RequestInit | undefined) => {
      const body = JSON.parse(String(init?.body)) as { entries: EntryView[] };
      for (const e of body.entries) {
        if (!rows.some((r) => r.kind === 'entry' && r.entry.id === e.id)) {
          rows.unshift({ kind: 'entry', entry: e });
        }
      }
      return Response.json({ entries: body.entries });
    },
  });

  return api;
}

describe('TransactionsScreen, Detail, Filters & SpendingBook widget', () => {
  it('rows grouped by day with a per-currency day total, newest first', async () => {
    mockMedia();
    setupMock();
    renderAt(<App />, { route: '/transactions?month=2026-11' });

    const group16 = await screen.findByTestId('tx-group-2026-11-16');
    const group15 = screen.getByTestId('tx-group-2026-11-15');
    const group14 = screen.getByTestId('tx-group-2026-11-14');

    // Newest first order in DOM
    expect(
      group16.compareDocumentPosition(group15) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      group15.compareDocumentPosition(group14) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Net total for 2026-11-16: +500.000 - 50.000 = +450.000₫
    expect(within(group16).getByText('+450.000₫')).toBeInTheDocument();
  });

  it('expense shows "−" and text-danger, income "+" and text-success, transfer "→ wallet" in neutral ink', async () => {
    mockMedia();
    setupMock();
    renderAt(<App />, { route: '/transactions?month=2026-11' });

    const expRow = await screen.findByTestId('tx-row-e-1');
    const expAmt = within(expRow).getByText('−50.000₫');
    expect(expAmt).toHaveClass('text-danger');

    const incRow = screen.getByTestId('tx-row-e-2');
    const incAmt = within(incRow).getByText('+500.000₫');
    expect(incAmt).toHaveClass('text-success');

    const trRow = screen.getByTestId('tx-row-e-t-out');
    const trAmt = within(trRow).getByText('250.000₫');
    expect(trAmt).toHaveClass('text-foreground');
    expect(within(trRow).getByText('→ USD Wallet')).toHaveClass('text-foreground');
  });

  it('before-start entries carry "Trước ngày bắt đầu ví"', async () => {
    mockMedia();
    setupMock();
    renderAt(<App />, { route: '/transactions?month=2026-11' });

    const oldRow = await screen.findByTestId('tx-row-e-3');
    expect(within(oldRow).getByText('Before wallet start date')).toBeInTheDocument();
  });

  it('quick expenses show "with Minh" and open the existing quick expense', async () => {
    mockMedia();
    setupMock();
    renderAt(<App />, { route: '/transactions?month=2026-11' });

    const row = await screen.findByTestId('tx-row-e-taxi');
    expect(within(row).getByText(/with Minh/i)).toBeInTheDocument();
    expect(within(row).getByText(/your share/i)).toBeInTheDocument();
    expect(row).toHaveAttribute('href', '/t/t-led/expenses/e-taxi');
  });

  it('filters show as removable pills; no match shows "Xóa bộ lọc"', async () => {
    mockMedia();
    setupMock();
    const user = userEvent.setup();
    renderAt(<App />, { route: '/transactions?month=2026-11' });

    await screen.findByTestId('tx-row-e-1');
    await user.click(screen.getByTestId('tx-filter-btn'));

    const searchInput = await screen.findByTestId('tx-filter-search');
    await user.type(searchInput, 'nomatchxyz');
    await user.click(screen.getByTestId('tx-filter-apply'));

    expect(await screen.findByTestId('tx-filter-pill-q')).toBeInTheDocument();
    expect(await screen.findByTestId('tx-no-match')).toBeInTheDocument();

    await user.click(screen.getByTestId('tx-clear-filters'));
    expect(await screen.findByTestId('tx-row-e-1')).toBeInTheDocument();
    expect(screen.queryByTestId('tx-filter-pill-q')).not.toBeInTheDocument();
  });

  it('delete asks first, removes the row, Undo within 5 s restores it, after 5 s it is gone', async () => {
    mockMedia();
    setupMock();
    const user = userEvent.setup();
    renderAt(<App />, { route: '/transactions?month=2026-11' });

    await user.click(await screen.findByTestId('tx-row-e-1'));
    expect(await screen.findByTestId('tx-detail-amount')).toHaveTextContent('−50.000₫');

    await user.click(screen.getByTestId('tx-detail-delete'));
    expect(await screen.findByText('Delete transaction?')).toBeInTheDocument();

    vi.useFakeTimers({ shouldAdvanceTime: true });
    await user.click(screen.getByTestId('tx-delete-confirm'));

    await waitFor(() => {
      expect(screen.queryByTestId('tx-row-e-1')).not.toBeInTheDocument();
    });

    const snack = await screen.findByRole('status');
    expect(within(snack).getByText('Deleted')).toBeInTheDocument();
    await user.click(within(snack).getByRole('button', { name: 'Undo' }));

    expect(await screen.findByTestId('tx-row-e-1')).toBeInTheDocument();

    // Now delete again and let 5 s elapse
    await user.click(screen.getByTestId('tx-row-e-1'));
    await user.click(await screen.findByTestId('tx-detail-delete'));
    await user.click(await screen.findByTestId('tx-delete-confirm'));

    await waitFor(() => {
      expect(screen.queryByTestId('tx-row-e-1')).not.toBeInTheDocument();
    });
    await screen.findByRole('status');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('deleting one side of a transfer removes both rows', async () => {
    mockMedia();
    setupMock();
    const user = userEvent.setup();
    renderAt(<App />, { route: '/transactions?month=2026-11' });

    expect(await screen.findByTestId('tx-row-e-t-out')).toBeInTheDocument();
    expect(screen.getByTestId('tx-row-e-t-in')).toBeInTheDocument();

    await user.click(screen.getByTestId('tx-row-e-t-out'));
    await user.click(await screen.findByTestId('tx-detail-delete'));
    await user.click(await screen.findByTestId('tx-delete-confirm'));

    await waitFor(() => {
      expect(screen.queryByTestId('tx-row-e-t-out')).not.toBeInTheDocument();
      expect(screen.queryByTestId('tx-row-e-t-in')).not.toBeInTheDocument();
    });
  });

  it('on a computer the details open in a Modal', async () => {
    mockMedia({ wide: true });
    setupMock();
    const user = userEvent.setup();
    renderAt(<App />, { route: '/transactions?month=2026-11' });

    await user.click(await screen.findByTestId('tx-row-e-1'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('tx-detail-amount')).toHaveTextContent('−50.000₫');
    expect(screen.getByTestId('location')).toHaveTextContent('/transactions');
  });

  it('SpendingBook shows up to 5 recent transactions and links "All" to /transactions', async () => {
    mockMedia();
    setupMock();
    renderAt(<App />, { route: '/trips' });

    const recent = await screen.findByTestId('book-recent');
    const allLink = within(recent).getByTestId('book-recent-all');
    expect(allLink).toHaveAttribute('href', '/transactions');

    const rows = within(recent).getAllByTestId(/^tx-row-/);
    expect(rows).toHaveLength(5);
  });
});
