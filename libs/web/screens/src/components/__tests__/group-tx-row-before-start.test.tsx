import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import type { CategoryView, GroupRow, GroupSettingsView, WalletDetailView } from '@cc/core';
import { renderAt } from '../../test/render';
import { GroupTxRow } from '../GroupTxRow';

const WALLETS: WalletDetailView[] = [
  {
    id: 'w-1',
    name: 'Techcombank',
    currency: 'VND',
    balance: 1000000,
    isDefault: true,
    kind: 'everyday',
    startAmount: 1000000,
    startDate: '2026-06-01',
    startCostVnd: null,
    vndValue: null,
    icon: null,
    sortOrder: 0,
    archived: false,
    entryCount: 0,
  },
];

const CATEGORIES: CategoryView[] = [
  {
    id: 'cat-food',
    parentId: null,
    type: 'expense',
    name: 'Food',
    icon: 'utensils',
    hidden: false,
    sortOrder: 0,
  },
];

const DEFAULT_SETTINGS: GroupSettingsView = {
  defaultGroupCategoryId: null,
  countLoans: false,
};

function makeRow(date: string, overrides: Partial<GroupRow> = {}): GroupRow {
  return {
    kind: 'group',
    id: 'g-1',
    rootId: 'r-1',
    tripId: 't-1',
    tripName: 'Đà Lạt',
    isDirect: false,
    source: 'expense',
    date,
    title: 'Lẩu tối',
    total: 300000,
    myShare: 100000,
    iPaid: false,
    payerName: 'Hùng',
    counterpartName: null,
    people: ['Hùng', 'Bạn', 'Lan'],
    pending: false,
    link: null,
    createdAt: `${date}T12:00:00Z`,
    ...overrides,
  };
}

describe('GroupTxRow before-start pill', () => {
  it('shows the neutral before-start pill when row.date < resolved wallet startDate', () => {
    renderAt(
      <GroupTxRow
        row={makeRow('2026-05-31')}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={DEFAULT_SETTINGS}
      />,
    );

    const btn = screen.getByTestId('tx-row-g-g-1');
    const pill = btn.querySelector('.fsl-pill--neutral');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent('Before wallet start date');
  });

  it('does not show the before-start pill when row.date is on or after resolved wallet startDate', () => {
    const { unmount } = renderAt(
      <GroupTxRow
        row={makeRow('2026-06-01')}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={DEFAULT_SETTINGS}
      />,
    );

    expect(screen.queryByText('Before wallet start date')).not.toBeInTheDocument();
    unmount();

    renderAt(
      <GroupTxRow
        row={makeRow('2026-06-02')}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={DEFAULT_SETTINGS}
      />,
    );

    expect(screen.queryByText('Before wallet start date')).not.toBeInTheDocument();
  });

  it('does not show the before-start pill when there is no resolved wallet', () => {
    renderAt(
      <GroupTxRow
        row={makeRow('2026-05-01')}
        wallets={[]}
        categories={CATEGORIES}
        settings={DEFAULT_SETTINGS}
      />,
    );

    expect(screen.queryByText('Before wallet start date')).not.toBeInTheDocument();
  });
});
