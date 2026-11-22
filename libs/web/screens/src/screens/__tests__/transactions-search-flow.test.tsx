import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import type { CategoryView, EntryView, ListQuery, ListRow, TagView, WalletDetailView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { hideUndo } from '../../components/UndoSnackbarHost';
import { TransactionsScreen } from '../TransactionsScreen';

const copyState: {
  status: 'loading' | 'ready';
  rows: ListRow[];
} = {
  status: 'ready',
  rows: [],
};

vi.mock('@cc/web-data-access/txCopy/hooks', () => ({
  useTxCopy: () => ({ status: copyState.status, snapshot: null }),
  useCopyList: (query: ListQuery) => {
    if (copyState.status !== 'ready') {
      return { rows: null, ready: false };
    }
    const filtered = copyState.rows.filter((row) => {
      if (row.kind !== 'entry') return false;
      const e = row.entry;
      if (query.month && !e.date.startsWith(query.month)) return false;
      if (query.from && e.date < query.from) return false;
      if (query.to && e.date > query.to) return false;
      if (query.walletId && e.walletId !== query.walletId) return false;
      if (query.tagId) {
        const matchesTag = e.tags.some(
          (tg) => tg === query.tagId || (query.tagId === 'tag-coffee' && tg === 'coffee'),
        );
        if (!matchesTag) return false;
      }
      if (query.q && !(e.note ?? '').toLowerCase().includes(query.q.toLowerCase())) {
        return false;
      }
      return true;
    });
    return { rows: filtered, ready: true };
  },
}));

function SearchProbe() {
  const { search } = useLocation();
  return <div data-testid="search-probe">{search}</div>;
}

function renderScreen(route = '/transactions?month=2026-11') {
  return renderAt(
    <>
      <TransactionsScreen />
      <SearchProbe />
    </>,
    { route, path: '/transactions' },
  );
}

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  copyState.status = 'ready';
  copyState.rows = [];
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
    startDate: '2026-01-01',
    startCostVnd: null,
    vndValue: 2000000,
    icon: 'bg-avatar-1',
    sortOrder: 0,
    archived: false,
    isDefault: true,
    entryCount: 2,
  },
  {
    id: 'w-bank',
    name: 'Bank',
    kind: 'everyday',
    currency: 'VND',
    balance: 5000000,
    startAmount: 5000000,
    startDate: '2026-01-01',
    startCostVnd: null,
    vndValue: 5000000,
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
];

const tags: TagView[] = [
  { id: 'tag-coffee', name: 'coffee', useCount: 2 },
];

const entryNovCoffee: EntryView = {
  id: 'e-nov-coffee',
  walletId: 'w-cash',
  type: 'expense',
  amount: 45000,
  currency: 'VND',
  categoryId: 'cat-food',
  transferId: null,
  counterpartWalletId: null,
  date: '2026-11-16',
  time: '09:00',
  note: 'Coffee morning',
  tags: ['coffee'],
  excludeFromReports: false,
  source: 'manual',
  beforeStart: false,
  createdAt: '2026-11-16T09:00:00.000Z',
};

const entrySepCoffee: EntryView = {
  id: 'e-sep-coffee',
  walletId: 'w-bank',
  type: 'expense',
  amount: 60000,
  currency: 'VND',
  categoryId: 'cat-food',
  transferId: null,
  counterpartWalletId: null,
  date: '2026-09-10',
  time: '14:00',
  note: 'Coffee afternoon',
  tags: ['coffee'],
  excludeFromReports: false,
  source: 'manual',
  beforeStart: false,
  createdAt: '2026-09-10T14:00:00.000Z',
};

const entryOctSnack: EntryView = {
  id: 'e-oct-snack',
  walletId: 'w-cash',
  type: 'expense',
  amount: 30000,
  currency: 'VND',
  categoryId: 'cat-food',
  transferId: null,
  counterpartWalletId: null,
  date: '2026-10-12',
  time: '16:00',
  note: 'Coffee snack',
  tags: [],
  excludeFromReports: false,
  source: 'manual',
  beforeStart: false,
  createdAt: '2026-10-12T16:00:00.000Z',
};

function setupApi(serverRows: ListRow[] = []) {
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/wallets': { wallets },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/assets': { assets: [] },
    'GET /api/me/personal/transactions': (_init: RequestInit | undefined, url: string) => {
      const parsed = new URL(url, 'http://localhost');
      const month = parsed.searchParams.get('month');
      const q = parsed.searchParams.get('q');
      let filtered = serverRows;
      if (month) {
        filtered = filtered.filter((r) =>
          (r.kind === 'entry' ? r.entry.date : r.date).startsWith(month),
        );
      }
      if (q) {
        filtered = filtered.filter((r) =>
          (r.kind === 'entry' ? r.entry.note ?? '' : r.note)
            .toLowerCase()
            .includes(q.toLowerCase()),
        );
      }
      return Response.json({ rows: filtered, totals: [] });
    },
  });
}

describe('TransactionsScreen search flow', () => {
  it('the header has no search icon and the body has the search bar', async () => {
    mockMedia();
    copyState.status = 'ready';
    copyState.rows = [{ kind: 'entry', entry: entryNovCoffee }];
    setupApi();

    const { container } = renderScreen('/transactions?month=2026-11');

    const searchInput = await screen.findByTestId('tx-filter-search');
    const header = container.querySelector('.fsl-screen__header') as HTMLElement;
    const body = container.querySelector('.fsl-transactions') as HTMLElement;

    expect(header).toBeInTheDocument();
    expect(within(header).queryByRole('button')).not.toBeInTheDocument();
    expect(within(header).queryByTestId('tx-filter-btn')).not.toBeInTheDocument();
    expect(within(body).getByTestId('tx-filter-search')).toBe(searchInput);
    expect(within(body).getByTestId('tx-search-submit')).toBeInTheDocument();
    expect(within(body).getByTestId('tx-filter-btn')).toBeInTheDocument();
  });

  it('submitting a search with the copy ready shows all-time results and "Mọi lúc"', async () => {
    mockMedia();
    copyState.status = 'ready';
    copyState.rows = [
      { kind: 'entry', entry: entryNovCoffee },
      { kind: 'entry', entry: entrySepCoffee },
    ];
    setupApi();

    renderScreen('/transactions?month=2026-11');

    expect(await screen.findByTestId('tx-row-e-nov-coffee')).toBeInTheDocument();
    expect(screen.queryByTestId('tx-row-e-sep-coffee')).not.toBeInTheDocument();

    await userEvent.type(screen.getByTestId('tx-filter-search'), 'Coffee');
    await userEvent.click(screen.getByTestId('tx-search-submit'));

    expect(await screen.findByTestId('tx-search-results')).toBeInTheDocument();
    expect(screen.getByTestId('tx-row-e-nov-coffee')).toBeInTheDocument();
    expect(screen.getByTestId('tx-row-e-sep-coffee')).toBeInTheDocument();
    expect(screen.getByTestId('tx-range-button')).toHaveTextContent('All time');
    expect(screen.queryByTestId('month-prev')).not.toBeInTheDocument();
    expect(screen.queryByTestId('month-next')).not.toBeInTheDocument();
  });

  it('before the copy is ready the search covers loaded months and shows the loading line', async () => {
    mockMedia();
    copyState.status = 'loading';
    copyState.rows = [];
    setupApi([
      { kind: 'entry', entry: entryNovCoffee },
      { kind: 'entry', entry: entryOctSnack },
    ]);

    renderScreen('/transactions?month=2026-11');

    expect(await screen.findByTestId('tx-row-e-nov-coffee')).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('tx-filter-search'), 'Coffee');
    await userEvent.click(screen.getByTestId('tx-search-submit'));

    expect(await screen.findByTestId('tx-loading-history')).toBeInTheDocument();
    expect(screen.queryByTestId('tx-search-results')).not.toBeInTheDocument();
    expect(screen.getByTestId('tx-row-e-nov-coffee')).toBeInTheDocument();

    await userEvent.click(await screen.findByTestId('tx-load-older'));
    expect(await screen.findByTestId('tx-row-e-oct-snack')).toBeInTheDocument();
  });

  it('picking a quick range hides the arrows', async () => {
    mockMedia();
    copyState.status = 'ready';
    copyState.rows = [{ kind: 'entry', entry: entryNovCoffee }];
    setupApi();

    renderScreen('/transactions?month=2026-11');

    expect(await screen.findByTestId('month-prev')).toBeInTheDocument();
    expect(screen.getByTestId('month-next')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('tx-month-label'));
    await userEvent.click(await screen.findByTestId('tx-when-quick-lastWeek'));

    expect(screen.queryByTestId('month-prev')).not.toBeInTheDocument();
    expect(screen.queryByTestId('month-next')).not.toBeInTheDocument();
    expect(screen.getByTestId('tx-range-button')).toHaveTextContent('Last week');
    expect(screen.getByTestId('tx-range-clear')).toBeInTheDocument();
  });

  it('clearing the range brings the arrows back', async () => {
    mockMedia();
    copyState.status = 'ready';
    copyState.rows = [{ kind: 'entry', entry: entryOctSnack }];
    setupApi();

    renderScreen('/transactions?month=2026-10');

    await userEvent.click(await screen.findByTestId('tx-month-label'));
    await userEvent.click(await screen.findByTestId('tx-when-quick-lastWeek'));

    expect(screen.queryByTestId('month-prev')).not.toBeInTheDocument();
    expect(screen.queryByTestId('month-next')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('tx-range-clear'));

    expect(await screen.findByTestId('month-prev')).toBeInTheDocument();
    expect(screen.getByTestId('month-next')).toBeInTheDocument();
    expect(screen.getByTestId('tx-month-label')).toHaveTextContent('Oct 2026');
  });

  it('applying a wallet in the advanced sheet keeps the typed text as q', async () => {
    mockMedia();
    copyState.status = 'ready';
    copyState.rows = [
      { kind: 'entry', entry: entryNovCoffee },
      { kind: 'entry', entry: entrySepCoffee },
    ];
    setupApi();

    renderScreen('/transactions?month=2026-11');

    const searchInput = await screen.findByTestId('tx-filter-search');
    await userEvent.type(searchInput, 'Coffee');

    await userEvent.click(screen.getByTestId('tx-filter-btn'));
    await userEvent.click(await screen.findByTestId('tx-filter-row-wallet'));
    await userEvent.click(await screen.findByTestId('tx-filter-wallet-w-cash'));
    await userEvent.click(await screen.findByTestId('tx-filter-apply'));

    expect(await screen.findByTestId('tx-filter-pill-walletId')).toBeInTheDocument();
    expect(screen.getByTestId('tx-filter-search')).toHaveValue('Coffee');
    expect(screen.getByTestId('tx-row-e-nov-coffee')).toBeInTheDocument();
    expect(screen.queryByTestId('tx-row-e-sep-coffee')).not.toBeInTheDocument();

    const params = new URLSearchParams(screen.getByTestId('search-probe').textContent ?? '');
    expect(params.get('q')).toBe('Coffee');
    expect(params.get('walletId')).toBe('w-cash');
  });

  it('Xóa tất cả clears q, tag, range and filters but keeps the month', async () => {
    mockMedia();
    copyState.status = 'ready';
    copyState.rows = [{ kind: 'entry', entry: entryOctSnack }];
    setupApi();

    renderScreen(
      '/transactions?month=2026-10&q=Coffee&tagId=tag-coffee&walletId=w-cash&from=2026-10-01&to=2026-10-15',
    );

    expect(await screen.findByTestId('tx-search-tag-chip')).toBeInTheDocument();
    expect(screen.getByTestId('tx-filter-pill-walletId')).toBeInTheDocument();
    expect(screen.getByTestId('tx-range-button')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('tx-clear-all'));

    expect(screen.getByTestId('tx-filter-search')).toHaveValue('');
    expect(screen.queryByTestId('tx-search-tag-chip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tx-active-filters')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tx-range-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('month-prev')).toBeInTheDocument();
    expect(screen.getByTestId('month-next')).toBeInTheDocument();
    expect(screen.getByTestId('tx-month-label')).toHaveTextContent('Oct 2026');

    const params = new URLSearchParams(screen.getByTestId('search-probe').textContent ?? '');
    expect(params.get('month')).toBe('2026-10');
    expect(params.get('q')).toBeNull();
    expect(params.get('tagId')).toBeNull();
    expect(params.get('walletId')).toBeNull();
    expect(params.get('from')).toBeNull();
    expect(params.get('to')).toBeNull();
  });

  it('no match shows the quiet block', async () => {
    mockMedia();
    copyState.status = 'ready';
    copyState.rows = [{ kind: 'entry', entry: entryNovCoffee }];
    setupApi();

    renderScreen('/transactions?month=2026-11');

    await userEvent.type(await screen.findByTestId('tx-filter-search'), 'nonexistent');
    await userEvent.click(screen.getByTestId('tx-search-submit'));

    const noMatch = await screen.findByTestId('tx-no-match');
    expect(noMatch).toBeInTheDocument();
    expect(noMatch).not.toHaveClass('bg-card');
    expect(noMatch).toHaveTextContent('No transactions match your filters.');
    expect(screen.getByTestId('tx-clear-filters')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('tx-clear-filters'));
    expect(await screen.findByTestId('tx-row-e-nov-coffee')).toBeInTheDocument();
  });

  it('empty past month offers Back to this month CTA, and empty current month offers Add transaction CTA', async () => {
    mockMedia();
    copyState.status = 'ready';
    copyState.rows = [];
    setupApi();

    const currentYm = new Date().toISOString().slice(0, 7);
    const pastView = renderScreen('/transactions?month=2025-01');
    const backBtn = await screen.findByTestId('tx-empty-back-current');
    expect(backBtn).toHaveTextContent('Back to this month');
    await userEvent.click(backBtn);
    const params = new URLSearchParams(screen.getByTestId('search-probe').textContent ?? '');
    expect(params.get('month')).toBe(currentYm);
    pastView.unmount();

    renderScreen(`/transactions?month=${currentYm}`);
    const addLink = await screen.findByTestId('tx-empty-add');
    expect(addLink).toHaveTextContent('Add transaction');
    expect(addLink).toHaveAttribute('href', '/entries/new');
  });
});
