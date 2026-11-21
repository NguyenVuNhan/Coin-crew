import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoryView, EntryView, ListQuery, TagView, WalletDetailView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { App } from '../../App';
import { hideUndo } from '../../components/UndoSnackbarHost';

const { useCopyListMock } = vi.hoisted(() => ({
  useCopyListMock: vi.fn(),
}));

vi.mock('@cc/web-data-access/txCopy/hooks', () => ({
  useCopyList: (...args: unknown[]) => useCopyListMock(...args),
  useTxCopy: () => ({ status: 'loading', snapshot: null }),
}));

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  useCopyListMock.mockReset();
});

afterEach(() => {
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
    startDate: '2026-10-01',
    startCostVnd: null,
    vndValue: 2000000,
    icon: 'bg-avatar-1',
    sortOrder: 0,
    archived: false,
    isDefault: true,
    entryCount: 2,
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
];

const tags: TagView[] = [];

const serverEntry: EntryView = {
  id: 'e-server',
  walletId: 'w-cash',
  type: 'expense',
  amount: 50000,
  currency: 'VND',
  categoryId: 'cat-food',
  transferId: null,
  counterpartWalletId: null,
  date: '2026-11-16',
  time: '09:00',
  note: 'From server',
  tags: [],
  excludeFromReports: false,
  source: 'manual',
  beforeStart: false,
  createdAt: '2026-11-16T09:00:00.000Z',
};

const copyEntry: EntryView = {
  ...serverEntry,
  id: 'e-copy',
  note: 'From copy',
};

const octCopyEntry: EntryView = {
  ...serverEntry,
  id: 'e-oct-copy',
  date: '2026-10-15',
  note: 'October copy',
  createdAt: '2026-10-15T09:00:00.000Z',
};

function setupApi(serverRows = [{ kind: 'entry' as const, entry: serverEntry }]) {
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/wallets': { wallets },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/summary': {
      month: '2026-11',
      totalVnd: 2000000,
      approximate: false,
      byCurrency: [],
      spent: [],
      income: [],
    },
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
    'GET /api/me/people/summary': { people: [], incomplete: false },
    'GET /api/me/personal/transactions': () => Response.json({ rows: serverRows, totals: [] }),
  });
}

describe('TransactionsScreen with local copy', () => {
  it('before the copy is ready the month loads from the server', async () => {
    mockMedia();
    useCopyListMock.mockReturnValue({ rows: null, ready: false });
    const { calls } = setupApi();

    renderAt(<App />, { route: '/transactions?month=2026-11' });

    expect(await screen.findByTestId('tx-row-e-server')).toBeInTheDocument();
    expect(calls.filter((c) => c.path.startsWith('/api/me/personal/transactions'))).toHaveLength(1);
  });

  it('while the copy is still opening the month waits instead of asking the server', async () => {
    mockMedia();
    useCopyListMock.mockReturnValue({ rows: null, ready: false, opening: true });
    const { calls } = setupApi();

    renderAt(<App />, { route: '/transactions?month=2026-11' });

    expect(await screen.findByTestId('tx-filter-search')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByTestId('tx-row-e-server')).not.toBeInTheDocument();
    expect(calls.filter((c) => c.path.startsWith('/api/me/personal/transactions'))).toHaveLength(0);
  });

  it('once ready, the month renders copy rows and makes no list request', async () => {
    mockMedia();
    useCopyListMock.mockReturnValue({
      rows: [{ kind: 'entry', entry: copyEntry }],
      ready: true,
    });
    const { calls } = setupApi();

    renderAt(<App />, { route: '/transactions?month=2026-11' });

    expect(await screen.findByTestId('tx-row-e-copy')).toBeInTheDocument();
    expect(screen.queryByTestId('tx-row-e-server')).not.toBeInTheDocument();
    expect(calls.filter((c) => c.path.startsWith('/api/me/personal/transactions'))).toHaveLength(0);
  });

  it('paging months while ready makes no list request', async () => {
    mockMedia();
    useCopyListMock.mockImplementation((query: ListQuery) => {
      if (query.month === '2026-11') {
        return { rows: [{ kind: 'entry', entry: copyEntry }], ready: true };
      }
      if (query.month === '2026-10') {
        return { rows: [{ kind: 'entry', entry: octCopyEntry }], ready: true };
      }
      return { rows: [], ready: true };
    });
    const { calls } = setupApi();

    renderAt(<App />, { route: '/transactions?month=2026-11' });

    expect(await screen.findByTestId('tx-row-e-copy')).toBeInTheDocument();

    await userEvent.click(await screen.findByTestId('tx-load-older'));

    expect(await screen.findByTestId('tx-row-e-oct-copy')).toBeInTheDocument();
    expect(calls.filter((c) => c.path.startsWith('/api/me/personal/transactions'))).toHaveLength(0);
  });
});
