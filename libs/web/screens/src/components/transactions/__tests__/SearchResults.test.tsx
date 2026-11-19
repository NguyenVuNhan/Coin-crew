import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { CategoryView, EntryView, ListRow, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { useCopyList } from '@cc/web-data-access/txCopy/hooks';
import { SearchResults } from '../SearchResults';

vi.mock('@cc/web-data-access/txCopy/hooks', () => ({
  useCopyList: vi.fn(),
}));

const mockedUseCopyList = vi.mocked(useCopyList);

const wallets: WalletDetailView[] = [
  {
    id: 'w-cash',
    name: 'Tiền mặt',
    kind: 'everyday',
    currency: 'VND',
    balance: 2000000,
    startAmount: 2000000,
    startDate: '2025-01-01',
    startCostVnd: null,
    vndValue: 2000000,
    icon: 'bg-avatar-1',
    sortOrder: 0,
    archived: false,
    isDefault: true,
    entryCount: 3,
  },
];

const categories: CategoryView[] = [
  {
    id: 'cat-food',
    parentId: null,
    type: 'expense',
    name: 'Ăn uống',
    icon: 'utensils',
    hidden: false,
    sortOrder: 0,
  },
  {
    id: 'cat-salary',
    parentId: null,
    type: 'income',
    name: 'Lương',
    icon: 'wallet',
    hidden: false,
    sortOrder: 1,
  },
];

function makeEntryRow(
  id: string,
  overrides: Partial<EntryView> = {},
): ListRow {
  return {
    kind: 'entry',
    entry: {
      id,
      walletId: 'w-cash',
      type: 'expense',
      amount: 50000,
      currency: 'VND',
      categoryId: 'cat-food',
      transferId: null,
      counterpartWalletId: null,
      date: '2026-11-19',
      time: '09:00',
      note: `Ghi chú ${id}`,
      tags: [],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-19T09:00:00.000Z',
      ...overrides,
    },
  };
}

function renderSearchResults(
  props: Partial<React.ComponentProps<typeof SearchResults>> = {},
) {
  return render(
    <MemoryRouter>
      <SearchResults
        filters={{ q: 'cà phê' }}
        viewMode="day"
        wallets={wallets}
        categories={categories}
        assets={[]}
        onClear={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
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

describe('SearchResults', () => {
  it('renders 50 of 2,000 rows, then 100 after "Xem thêm"', () => {
    const rows: ListRow[] = Array.from({ length: 2000 }, (_, i) =>
      makeEntryRow(`e-${i}`, {
        date: i < 1000 ? '2026-11-19' : '2026-11-18',
      }),
    );
    mockedUseCopyList.mockReturnValue({ ready: true, rows });

    renderSearchResults();

    expect(screen.getAllByTestId(/^tx-row-/)).toHaveLength(50);
    const moreBtn = screen.getByTestId('tx-search-more');
    expect(moreBtn).toHaveTextContent('Xem thêm');

    fireEvent.click(moreBtn);
    expect(screen.getAllByTestId(/^tx-row-/)).toHaveLength(100);
  });

  it('a day from last year shows its year', () => {
    const rows: ListRow[] = [
      makeEntryRow('e-2026', { date: '2026-11-19' }),
      makeEntryRow('e-2025', { date: '2025-11-19' }),
    ];
    mockedUseCopyList.mockReturnValue({ ready: true, rows });

    renderSearchResults();

    const group2026 = screen.getByTestId('tx-group-2026-11-19');
    expect(within(group2026).getByText(/19\/11$/)).toBeInTheDocument();

    const group2025 = screen.getByTestId('tx-group-2025-11-19');
    expect(within(group2025).getByText(/19\/11\/2025$/)).toBeInTheDocument();
  });

  it('category view groups all matches', () => {
    const rows: ListRow[] = [
      makeEntryRow('e-1', { date: '2026-11-19', categoryId: 'cat-food' }),
      makeEntryRow('e-2', { date: '2025-05-01', categoryId: 'cat-food' }),
      makeEntryRow('e-3', {
        date: '2026-10-01',
        type: 'income',
        categoryId: 'cat-salary',
      }),
    ];
    mockedUseCopyList.mockReturnValue({ ready: true, rows });

    renderSearchResults({ viewMode: 'category' });

    const foodGroup = screen.getByTestId('tx-group-cat:cat-food');
    expect(within(foodGroup).getByText('Ăn uống')).toBeInTheDocument();
    expect(within(foodGroup).getAllByTestId(/^tx-row-/)).toHaveLength(2);

    const salaryGroup = screen.getByTestId('tx-group-cat:cat-salary');
    expect(within(salaryGroup).getByText('Lương')).toBeInTheDocument();
    expect(within(salaryGroup).getAllByTestId(/^tx-row-/)).toHaveLength(1);
  });

  it('no rows shows NoMatch', () => {
    const onClear = vi.fn();
    mockedUseCopyList.mockReturnValue({ ready: true, rows: [] });

    renderSearchResults({ onClear });

    const noMatch = screen.getByTestId('tx-no-match');
    expect(noMatch).toBeInTheDocument();
    expect(noMatch).not.toHaveClass('border');
    expect(
      within(noMatch).getByText('Không có giao dịch nào khớp bộ lọc.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tx-clear-filters'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when copy is not ready', () => {
    mockedUseCopyList.mockReturnValue({ ready: false, rows: null });

    const { container } = renderSearchResults();

    expect(container).toBeEmptyDOMElement();
  });
});
