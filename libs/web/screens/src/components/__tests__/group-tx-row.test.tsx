import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoryView, GroupRow, GroupSettingsView, WalletDetailView } from '@cc/core';
import { renderAt } from '../../test/render';
import { GroupTxRow } from '../GroupTxRow';
import { TransactionRow } from '../TransactionRow';

const WALLETS: WalletDetailView[] = [
  {
    id: 'w-1',
    name: 'Techcombank',
    currency: 'VND',
    balance: 1000000,
    isDefault: true,
    kind: 'everyday',
    startAmount: 1000000,
    startDate: '2026-01-01',
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

function makeRow(overrides: Partial<GroupRow> = {}): GroupRow {
  return {
    kind: 'group',
    activityAt: '2026-11-01T00:00:00.000Z',
    id: 'g-1',
    rootId: 'r-1',
    tripId: 't-1',
    tripName: 'Đà Lạt',
    isDirect: false,
    source: 'expense',
    date: '2026-11-15',
    title: 'Lẩu tối',
    total: 300000,
    myShare: 100000,
    iPaid: false,
    payerName: 'Hùng',
    counterpartName: null,
    people: ['Hùng', 'Bạn', 'Lan'],
    pending: false,
    link: null,
    createdAt: '2026-11-15T12:00:00Z',
    ...overrides,
  };
}

describe('GroupTxRow', () => {
  it('someone else paid: shows −myShare, your share label, payer and wallet', async () => {
    const onOpen = vi.fn();
    const row = makeRow({
      id: 'exp-other',
      title: 'Taxi sân bay',
      total: 240000,
      myShare: 80000,
      iPaid: false,
      payerName: 'Hùng',
    });

    renderAt(
      <GroupTxRow
        row={row}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={DEFAULT_SETTINGS}
        onOpen={onOpen}
      />,
    );

    const btn = screen.getByTestId('tx-row-g-exp-other');
    expect(btn).toHaveClass('fsl-tx-row', 'fsl-tx-row--group');
    expect(btn).toHaveTextContent('Taxi sân bay');
    expect(btn).toHaveTextContent('Đà Lạt');
    expect(btn).toHaveTextContent('Hùng paid · Not from wallet yet');
    expect(btn).not.toHaveTextContent('Techcombank');
    expect(btn).toHaveTextContent('\u221280.000₫');
    expect(btn).toHaveTextContent('your share');
    expect(btn.querySelector('.fsl-pill--accent')).toBeNull();

    await userEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith(row);
  });

  it('I paid with share: shows −myShare, your share label, and You paid meta', () => {
    const row = makeRow({
      id: 'exp-me',
      title: 'Lẩu tối',
      total: 300000,
      myShare: 100000,
      iPaid: true,
      payerName: 'Bạn',
    });

    renderAt(
      <GroupTxRow
        row={row}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={DEFAULT_SETTINGS}
        onOpen={vi.fn()}
      />,
    );

    const btn = screen.getByTestId('tx-row-g-exp-me');
    expect(btn).toHaveTextContent('Lẩu tối');
    expect(btn).toHaveTextContent('Paid 300.000₫');
    expect(btn).toHaveTextContent('\u2212100.000₫');
    expect(btn).toHaveTextContent('your share');
  });

  it('I paid not in it: shows −total as movement in neutral ink without your share', () => {
    const row = makeRow({
      id: 'exp-notin',
      title: 'Mua vé hộ',
      total: 200000,
      myShare: 0,
      iPaid: true,
      payerName: 'Bạn',
    });

    renderAt(
      <GroupTxRow
        row={row}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={DEFAULT_SETTINGS}
        onOpen={vi.fn()}
      />,
    );

    const btn = screen.getByTestId('tx-row-g-exp-notin');
    expect(btn).toHaveTextContent('Paid 200.000₫');
    expect(btn).toHaveTextContent('\u2212200.000₫');
    expect(btn).not.toHaveTextContent('your share');
    expect(btn.querySelector('.fsl-tx-row__amount')).toHaveClass('text-foreground');
  });

  it('fund: shows −total as spending with Into the group fund meta', () => {
    const row = makeRow({
      id: 'fund-1',
      source: 'fund',
      tripName: 'Cầu lông T5',
      title: 'Đóng quỹ tháng 11',
      total: 500000,
      myShare: 500000,
      iPaid: true,
    });

    renderAt(
      <GroupTxRow
        row={row}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={DEFAULT_SETTINGS}
        onOpen={vi.fn()}
      />,
    );

    const btn = screen.getByTestId('tx-row-g-fund-1');
    expect(btn).toHaveTextContent('Đóng quỹ tháng 11');
    expect(btn).toHaveTextContent('Cầu lông T5');
    expect(btn).toHaveTextContent('Into the group fund');
    expect(btn).toHaveTextContent('\u2212500.000₫');
    expect(btn.querySelector('.fsl-tx-row__amount')).toHaveClass('text-danger');
    expect(btn).not.toHaveTextContent('your share');
  });

  it('payment out: shows muted −total, Not in spending sublabel, and muted icon tile', () => {
    const row = makeRow({
      id: 'pay-out',
      source: 'payment',
      title: 'Thanh toán',
      total: 150000,
      myShare: 0,
      iPaid: true,
      counterpartName: 'Minh',
    });

    renderAt(
      <GroupTxRow
        row={row}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={DEFAULT_SETTINGS}
        onOpen={vi.fn()}
      />,
    );

    const btn = screen.getByTestId('tx-row-g-pay-out');
    expect(btn).toHaveTextContent('You paid Minh');
    expect(btn).toHaveTextContent('Đà Lạt · Group settle-up');
    expect(btn).toHaveTextContent('\u2212150.000₫');
    expect(btn).toHaveTextContent('Not in spending');
    expect(btn.querySelector('.fsl-tx-row__amount')).toHaveClass('text-muted-foreground');
    expect(btn.querySelector('.bg-muted')).toBeInTheDocument();
  });

  it('payment in: shows muted +total, Not in income sublabel, and muted icon tile', () => {
    const row = makeRow({
      id: 'pay-in',
      source: 'payment',
      title: 'Thanh toán',
      total: 200000,
      myShare: 0,
      iPaid: false,
      counterpartName: 'Minh',
    });

    renderAt(
      <GroupTxRow
        row={row}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={DEFAULT_SETTINGS}
        onOpen={vi.fn()}
      />,
    );

    const btn = screen.getByTestId('tx-row-g-pay-in');
    expect(btn).toHaveTextContent('Minh paid you');
    expect(btn).toHaveTextContent('Đà Lạt · Group repayment');
    expect(btn).toHaveTextContent('+200.000₫');
    expect(btn).toHaveTextContent('Not in income');
    expect(btn.querySelector('.fsl-tx-row__amount')).toHaveClass('text-muted-foreground');
    expect(btn.querySelector('.bg-muted')).toBeInTheDocument();
  });

  it('pending expense: shows muted amount without sign, warning pill, and pending meta', () => {
    const row = makeRow({
      id: 'pend-exp',
      title: 'Vé cáp treo',
      total: 180000,
      myShare: 60000,
      iPaid: false,
      payerName: 'Lan',
      pending: true,
    });

    renderAt(
      <GroupTxRow
        row={row}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={DEFAULT_SETTINGS}
        onOpen={vi.fn()}
      />,
    );

    const btn = screen.getByTestId('tx-row-g-pend-exp');
    expect(btn).toHaveTextContent('Vé cáp treo');
    expect(btn).toHaveTextContent('Đà Lạt · Not counted');
    expect(btn).toHaveTextContent('Waiting for approval');
    const amount = btn.querySelector('.fsl-tx-row__amount');
    expect(amount).toHaveTextContent('60.000₫');
    expect(amount?.textContent).not.toMatch(/^[+\u2212]/);
    expect(amount).toHaveClass('text-muted-foreground');
    expect(btn.querySelector('.fsl-pill--warning')).toBeInTheDocument();
  });

  it('says_paid payment: shows muted total without sign, warning pill, and pending meta', () => {
    const row = makeRow({
      id: 'says-paid',
      source: 'payment',
      title: 'Thanh toán',
      total: 120000,
      myShare: 0,
      iPaid: true,
      counterpartName: 'Lan',
      pending: true,
    });

    renderAt(
      <GroupTxRow
        row={row}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={DEFAULT_SETTINGS}
        onOpen={vi.fn()}
      />,
    );

    const btn = screen.getByTestId('tx-row-g-says-paid');
    expect(btn).toHaveTextContent('You paid Lan');
    expect(btn).toHaveTextContent('Đà Lạt · Not counted');
    const amount = btn.querySelector('.fsl-tx-row__amount');
    expect(amount).toHaveTextContent('120.000₫');
    expect(amount?.textContent).not.toMatch(/^[+\u2212]/);
    expect(amount).toHaveClass('text-muted-foreground');
    expect(btn.querySelector('.fsl-pill--warning')).toBeInTheDocument();
  });

  it('loan lent: movement −total when countLoans is off; spending −lent when countLoans is on', () => {
    const row = makeRow({
      id: 'loan-lent',
      isDirect: true,
      tripName: 'Direct',
      title: 'Cho Minh vay',
      total: 500000,
      myShare: 0,
      iPaid: true,
      link: {
        walletId: null,
        categoryId: null,
        tagIds: [],
        intent: 'loan',
        excludeFromReports: false,
      },
    });

    const { unmount } = renderAt(
      <GroupTxRow
        row={row}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={{ defaultGroupCategoryId: null, countLoans: false }}
        onOpen={vi.fn()}
      />,
    );

    let btn = screen.getByTestId('tx-row-g-loan-lent');
    expect(btn).toHaveTextContent('With others');
    expect(btn).toHaveTextContent('\u2212500.000₫');
    expect(btn.querySelector('.fsl-tx-row__amount')).toHaveClass('text-foreground');
    unmount();

    renderAt(
      <GroupTxRow
        row={row}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={{ defaultGroupCategoryId: null, countLoans: true }}
        onOpen={vi.fn()}
      />,
    );

    btn = screen.getByTestId('tx-row-g-loan-lent');
    expect(btn).toHaveTextContent('\u2212500.000₫');
    expect(btn.querySelector('.fsl-tx-row__amount')).toHaveClass('text-danger');
  });

  it('loan borrowed: movement +myShare when countLoans is off; income +myShare when countLoans is on', () => {
    const row = makeRow({
      id: 'loan-borrowed',
      isDirect: true,
      tripName: 'Direct',
      title: 'Vay Minh',
      total: 300000,
      myShare: 300000,
      iPaid: false,
      payerName: 'Minh',
      link: {
        walletId: null,
        categoryId: null,
        tagIds: [],
        intent: 'loan',
        excludeFromReports: false,
      },
    });

    const { unmount } = renderAt(
      <GroupTxRow
        row={row}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={{ defaultGroupCategoryId: null, countLoans: false }}
        onOpen={vi.fn()}
      />,
    );

    let btn = screen.getByTestId('tx-row-g-loan-borrowed');
    expect(btn).toHaveTextContent('With others');
    expect(btn).toHaveTextContent('Minh paid');
    expect(btn).toHaveTextContent('+300.000₫');
    expect(btn.querySelector('.fsl-tx-row__amount')).toHaveClass('text-foreground');
    unmount();

    renderAt(
      <GroupTxRow
        row={row}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={{ defaultGroupCategoryId: null, countLoans: true }}
        onOpen={vi.fn()}
      />,
    );

    btn = screen.getByTestId('tx-row-g-loan-borrowed');
    expect(btn).toHaveTextContent('+300.000₫');
    expect(btn.querySelector('.fsl-tx-row__amount')).toHaveClass('text-success');
  });

  it('TransactionRow dispatches kind="group" to GroupTxRow', async () => {
    const onOpenGroup = vi.fn();
    const row = makeRow({ id: 'dispatch-1', title: 'Cà phê' });

    renderAt(
      <TransactionRow
        row={row}
        wallets={WALLETS}
        categories={CATEGORIES}
        settings={DEFAULT_SETTINGS}
        onOpenGroup={onOpenGroup}
      />,
    );

    const btn = screen.getByTestId('tx-row-g-dispatch-1');
    expect(btn).toHaveClass('fsl-tx-row--group');
    await userEvent.click(btn);
    expect(onOpenGroup).toHaveBeenCalledWith(row);
  });

  it('shows resolved wallet name when user has 2+ active wallets and omits it with 1 active wallet', () => {
    const secondWallet: WalletDetailView = {
      ...WALLETS[0]!,
      id: 'w-2',
      name: 'Tiền mặt',
      isDefault: false,
      sortOrder: 1,
    };
    const row = makeRow({ id: 'multi-w', payerName: 'Hùng' });

    renderAt(
      <GroupTxRow
        row={row}
        wallets={[WALLETS[0]!, secondWallet]}
        categories={CATEGORIES}
        settings={DEFAULT_SETTINGS}
      />,
    );

    expect(screen.getByTestId('tx-row-g-multi-w')).toHaveTextContent('Hùng paid · Techcombank');
  });
});
