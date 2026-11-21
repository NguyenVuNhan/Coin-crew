import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { CategoryView, EntryView, GroupRow, ListRow, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { useCopyList } from '@cc/web-data-access/txCopy/hooks';
import { SearchResults } from '../transactions/SearchResults';

vi.mock('@cc/web-data-access/txCopy/hooks', () => ({
  useCopyList: vi.fn(),
}));

const mockedUseCopyList = vi.mocked(useCopyList);

const WALLETS: WalletDetailView[] = [
  {
    id: 'w-cash',
    name: 'Tiền mặt',
    kind: 'everyday',
    currency: 'VND',
    balance: 2_000_000,
    startAmount: 2_000_000,
    startDate: '2025-01-01',
    startCostVnd: null,
    vndValue: 2_000_000,
    icon: null,
    sortOrder: 0,
    archived: false,
    isDefault: true,
    entryCount: 1,
  },
];

const CATEGORIES: CategoryView[] = [
  {
    id: 'cat-food',
    parentId: null,
    type: 'expense',
    name: 'Ăn uống',
    icon: 'utensils',
    hidden: false,
    sortOrder: 0,
  },
];

function makeEntryRow(id: string, overrides: Partial<EntryView> = {}): ListRow {
  return {
    kind: 'entry',
    entry: {
      id,
      walletId: 'w-cash',
      type: 'expense',
      amount: 50_000,
      currency: 'VND',
      categoryId: 'cat-food',
      transferId: null,
      counterpartWalletId: null,
      date: '2026-11-19',
      time: '09:00',
      note: 'Cà phê sáng',
      tags: [],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-19T09:00:00.000Z',
      ...overrides,
    },
  };
}

function makeGroupRow(overrides: Partial<GroupRow> = {}): GroupRow {
  return {
    kind: 'group',
    id: 'g-1',
    rootId: 'r-1',
    tripId: 'trip-1',
    tripName: 'Đà Lạt',
    isDirect: false,
    source: 'expense',
    date: '2026-11-19',
    title: 'Cà phê chiều',
    total: 120_000,
    myShare: 60_000,
    iPaid: false,
    payerName: 'Minh',
    counterpartName: null,
    people: ['Minh', 'Bạn'],
    pending: false,
    link: null,
    createdAt: '2026-11-19T15:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  setLang('vi', false);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T12:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('SearchResults with group rows', () => {
  it('merges group rows matching the search title with entries via compareBookRows and calls onOpenGroup', async () => {
    const onOpenGroup = vi.fn();
    const groupRow = makeGroupRow({
      id: 'g-coffee',
      title: 'Cà phê chiều',
      date: '2026-11-19',
      createdAt: '2026-11-19T15:00:00.000Z',
    });
    const entryRow = makeEntryRow('e-1', {
      date: '2026-11-19',
      createdAt: '2026-11-19T09:00:00.000Z',
    });

    mockedUseCopyList.mockReturnValue({ opening: false, ready: true, rows: [entryRow] });

    render(
      <MemoryRouter>
        <SearchResults
          filters={{ q: 'cà phê' }}
          viewMode="day"
          wallets={WALLETS}
          categories={CATEGORIES}
          assets={[]}
          groupRows={[groupRow]}
          onOpenGroup={onOpenGroup}
          onClear={vi.fn()}
        />
      </MemoryRouter>,
    );

    const dayGroup = screen.getByTestId('tx-group-2026-11-19');
    const rows = within(dayGroup).getAllByTestId(/^tx-row-/);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-testid', 'tx-row-g-g-coffee');
    expect(rows[1]).toHaveAttribute('data-testid', 'tx-row-e-1');

    fireEvent.click(rows[0]!);
    expect(onOpenGroup).toHaveBeenCalledWith(groupRow);
  });

  it('lists a group row matching the trip name even when no personal entries match', () => {
    const groupRow = makeGroupRow({
      id: 'g-trip',
      title: 'Ăn tối',
      tripName: 'Đà Lạt',
    });

    mockedUseCopyList.mockReturnValue({ opening: false, ready: true, rows: [] });

    render(
      <MemoryRouter>
        <SearchResults
          filters={{ q: 'Đà Lạt' }}
          viewMode="day"
          wallets={WALLETS}
          categories={CATEGORIES}
          assets={[]}
          groupRows={[groupRow]}
          onClear={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('tx-no-match')).not.toBeInTheDocument();
    const rowEl = screen.getByTestId('tx-row-g-g-trip');
    expect(rowEl).toHaveTextContent('Ăn tối');
    expect(rowEl).toHaveTextContent('Đà Lạt');
  });
});
