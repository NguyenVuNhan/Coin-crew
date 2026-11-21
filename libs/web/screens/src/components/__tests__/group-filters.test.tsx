import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import {
  filterGroupRows,
  type CategoryView,
  type EntryView,
  type GroupListQuery,
  type GroupRow,
  type GroupSettingsView,
  type ListRow,
  type WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt } from '../../test/render';
import { App } from '../../App';
import { useTxParams } from '../transactions/useTxParams';

const { useCopyListMock, useCopyGroupRowsMock } = vi.hoisted(() => ({
  useCopyListMock: vi.fn(),
  useCopyGroupRowsMock: vi.fn(),
}));

vi.mock('@cc/web-data-access/txCopy/hooks', () => ({
  useCopyList: (...args: unknown[]) => useCopyListMock(...args),
  useTxCopy: () => ({ status: 'unavailable', snapshot: null }),
}));

vi.mock('@cc/web-data-access/txCopy/groupCopy', () => ({
  useCopyGroupRows: (...args: unknown[]) => useCopyGroupRowsMock(...args),
}));

function makeWallet(id: string, name: string): WalletDetailView {
  return {
    id,
    name,
    kind: 'everyday',
    currency: 'VND',
    balance: 2_000_000,
    startAmount: 2_000_000,
    startDate: '2026-11-01',
    startCostVnd: null,
    vndValue: null,
    icon: null,
    sortOrder: 0,
    archived: false,
    entryCount: 0,
    isDefault: true,
  };
}

function makeCategory(id: string, name: string): CategoryView {
  return {
    id,
    parentId: null,
    type: 'expense',
    name,
    icon: 'utensils',
    hidden: false,
    sortOrder: 0,
  };
}

function makeEntry(id: string, note: string): EntryView {
  return {
    id,
    walletId: 'w-bank',
    type: 'expense',
    amount: 50_000,
    currency: 'VND',
    categoryId: 'cat-food',
    assetId: null,
    quantity: null,
    date: '2026-11-15',
    time: null,
    note,
    excludeFromReports: false,
    tags: [],
    source: 'manual',
    beforeStart: false,
    counterpartWalletId: null,
    transferId: null,
    createdAt: '2026-11-15T10:00:00.000Z',
  };
}

function makeGroupRow(over: Partial<GroupRow> & { id: string }): GroupRow {
  return {
    kind: 'group',
    rootId: over.id,
    tripId: 'trip-dalat',
    tripName: 'Đà Lạt',
    isDirect: false,
    source: 'expense',
    date: '2026-11-18',
    title: 'Lẩu tối',
    total: 300_000,
    myShare: 100_000,
    iPaid: true,
    payerName: null,
    counterpartName: null,
    people: ['Minh', 'Lan'],
    pending: false,
    link: null,
    createdAt: '2026-11-18T12:00:00.000Z',
    ...over,
  };
}

const wallets = [makeWallet('w-bank', 'Techcombank')];
const categories = [
  makeCategory('cat-food', 'Ăn uống'),
  makeCategory('cat-group', 'Nhóm'),
];
const groupSettings: GroupSettingsView = {
  defaultGroupCategoryId: 'cat-group',
  countLoans: false,
};

const dalatRow = makeGroupRow({
  id: 'g-dalat',
  tripId: 'trip-dalat',
  tripName: 'Đà Lạt',
  isDirect: false,
  title: 'Lẩu tối',
  date: '2026-11-18',
});

const directRow = makeGroupRow({
  id: 'g-direct',
  tripId: 'trip-direct',
  tripName: 'Với Minh',
  isDirect: true,
  title: 'Cà phê với Minh',
  date: '2026-11-17',
});

const personalEntry = makeEntry('e-solo', 'Phở sáng');

function setupFetchMock(opts?: {
  rows?: ListRow[];
  groupRows?: GroupRow[];
}) {
  const allRows = opts?.rows ?? [{ kind: 'entry', entry: personalEntry }];
  const allGroupRows = opts?.groupRows ?? [dalatRow, directRow];
  const calls: string[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const raw = typeof input === 'string' ? input : input.toString();
    const url = new URL(raw, 'http://localhost');
    const path = `${url.pathname}${url.search}`;
    calls.push(path);

    let body: unknown = {};
    if (url.pathname === '/api/me') {
      body = {
        user: {
          id: 'u-me',
          email: 'me@example.com',
          name: 'Me',
          consentAt: '2026-10-12T00:00:00.000Z',
        },
        signIn: { zalo: true },
        mergeRequests: { incoming: [], outgoing: [] },
        personalArea: true,
      };
    } else if (url.pathname === '/api/trips') {
      body = { trips: [] };
    } else if (url.pathname === '/api/me/personal/wallets') {
      body = { wallets };
    } else if (url.pathname === '/api/me/personal/categories') {
      body = { categories };
    } else if (url.pathname === '/api/me/personal/assets') {
      body = { assets: [] };
    } else if (url.pathname === '/api/me/personal/tags') {
      body = { tags: [] };
    } else if (url.pathname === '/api/me/personal/group-settings') {
      body = { settings: groupSettings };
    } else if (url.pathname === '/api/me/personal/balance-checks') {
      body = { wallets: [] };
    } else if (url.pathname === '/api/me/personal/transactions') {
      const tripId = url.searchParams.get('tripId') ?? undefined;
      const groups = (url.searchParams.get('groups') as 'show' | 'hide' | null) ?? 'show';
      const query: GroupListQuery = {
        month: url.searchParams.get('month') ?? undefined,
        tripId,
        groups,
      };
      const filteredGroups = filterGroupRows(allGroupRows, query, new Map());
      // Server excludes personal entries when a tripId filter is active, or returns them otherwise.
      const filteredRows = tripId ? [] : allRows;
      body = {
        rows: filteredRows,
        totals: [{ currency: 'VND', spent: 0, income: 0 }],
        groupRows: groups === 'show' ? filteredGroups : [],
      };
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}

beforeEach(() => {
  localStorage.clear();
  setLang('vi', false);
  useCopyListMock.mockReset();
  useCopyListMock.mockReturnValue({ rows: null, ready: false, opening: false });
  useCopyGroupRowsMock.mockReset();
  useCopyGroupRowsMock.mockReturnValue({ groupRows: null, ready: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Group filters in Sổ chi tiêu', () => {
  it('URL params trip and groups=hide map to filters and survive reload', () => {
    function mountParams(initialEntry: string) {
      let latest!: ReturnType<typeof useTxParams>;
      function Harness() {
        latest = useTxParams();
        const location = useLocation();
        return <span data-testid="search">{location.search}</span>;
      }
      render(
        <MemoryRouter initialEntries={[initialEntry]}>
          <Harness />
        </MemoryRouter>,
      );
      return {
        get current() {
          return latest;
        },
        getSearch() {
          return screen.getByTestId('search').textContent ?? '';
        },
      };
    }

    const reloaded = mountParams('/transactions?month=2026-11&trip=trip-dalat&groups=hide');
    expect(reloaded.current.filters.tripId).toBe('trip-dalat');
    expect(reloaded.current.filters.groups).toBe('hide');
    expect(reloaded.current.hasAnyFilter).toBe(true);
    expect(reloaded.current.advancedCount).toBe(2);

    act(() => {
      reloaded.current.set({ groups: undefined });
    });
    const afterShow = new URLSearchParams(reloaded.getSearch());
    expect(afterShow.get('trip')).toBe('trip-dalat');
    expect(afterShow.has('groups')).toBe(false);

    act(() => {
      reloaded.current.clearAll();
    });
    expect(reloaded.getSearch()).toBe('?month=2026-11');
  });

  it('pick group shows only its rows, pill removes it, and direct group is listed as "Với người khác"', async () => {
    const user = userEvent.setup();
    setupFetchMock();

    renderAt(<App />, { route: '/transactions?month=2026-11' });

    expect(await screen.findByTestId('tx-row-g-g-dalat')).toBeInTheDocument();
    expect(screen.getByTestId('tx-row-g-g-direct')).toBeInTheDocument();
    expect(screen.getByTestId('tx-row-e-solo')).toBeInTheDocument();

    await user.click(screen.getByTestId('tx-filter-btn'));
    await user.click(screen.getByTestId('tx-filter-row-trip'));

    expect(screen.getByTestId('tx-filter-trip-trip-dalat')).toHaveTextContent('Đà Lạt');
    expect(screen.getByTestId('tx-filter-trip-trip-direct')).toHaveTextContent('With others');

    await user.click(screen.getByTestId('tx-filter-trip-trip-dalat'));
    await user.click(screen.getByTestId('tx-filter-apply'));

    await waitFor(() => {
      expect(screen.queryByTestId('tx-row-g-g-direct')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('tx-row-g-g-dalat')).toBeInTheDocument();
    expect(screen.queryByTestId('tx-row-e-solo')).not.toBeInTheDocument();

    const tripPill = screen.getByTestId('tx-filter-pill-tripId');
    expect(tripPill).toHaveTextContent('Group: Đà Lạt');

    await user.click(tripPill);
    expect(await screen.findByTestId('tx-row-g-g-direct')).toBeInTheDocument();
    expect(screen.getByTestId('tx-row-e-solo')).toBeInTheDocument();
  });

  it('toggling "Hiện khoản từ nhóm" off hides all group rows and clear-all restores them', async () => {
    const user = userEvent.setup();
    setupFetchMock();

    renderAt(<App />, { route: '/transactions?month=2026-11' });

    expect(await screen.findByTestId('tx-row-g-g-dalat')).toBeInTheDocument();
    expect(screen.getByTestId('tx-row-e-solo')).toBeInTheDocument();

    await user.click(screen.getByTestId('tx-filter-btn'));
    const showSwitch = screen.getByTestId('tx-filter-show-groups');
    expect(showSwitch).toHaveAttribute('aria-checked', 'true');

    await user.click(showSwitch);
    expect(showSwitch).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByTestId('tx-filter-apply'));

    await waitFor(() => {
      expect(screen.queryByTestId('tx-row-g-g-dalat')).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('tx-row-g-g-direct')).not.toBeInTheDocument();
    expect(screen.getByTestId('tx-row-e-solo')).toBeInTheDocument();

    const groupsPill = screen.getByTestId('tx-filter-pill-groups');
    expect(groupsPill).toHaveTextContent('Show group items');

    await user.click(screen.getByTestId('tx-clear-all'));
    expect(await screen.findByTestId('tx-row-g-g-dalat')).toBeInTheDocument();
    expect(screen.getByTestId('tx-row-g-g-direct')).toBeInTheDocument();
  });

  it('renders active pill and filters list when reloaded with ?trip=trip-dalat', async () => {
    useCopyGroupRowsMock.mockImplementation((query: GroupListQuery) => ({
      groupRows: filterGroupRows([dalatRow, directRow], { ...query, groups: query.groups ?? 'show' }, new Map()),
      ready: true,
    }));
    useCopyListMock.mockReturnValue({
      rows: [{ kind: 'entry', entry: personalEntry }],
      ready: true,
      opening: false,
    });
    setupFetchMock();

    renderAt(<App />, { route: '/transactions?month=2026-11&trip=trip-dalat' });

    const pill = await screen.findByTestId('tx-filter-pill-tripId');
    expect(pill).toHaveTextContent('Group: Đà Lạt');
    expect(screen.getByTestId('tx-row-g-g-dalat')).toBeInTheDocument();
    expect(screen.queryByTestId('tx-row-g-g-direct')).not.toBeInTheDocument();
  });
});
