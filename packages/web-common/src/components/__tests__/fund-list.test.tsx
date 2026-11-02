import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@fsl/core';
import { renderAt } from '../../test/render';
import { tripView, PIDS } from '../../test/fixtures';
import { sportFundView, sportMemberView } from '../../test/fundFixtures';
import { t } from '../../i18n';
import { incomeActions, expenseActions } from '../../lib/rowActions';
import { ExpenseList } from '../ExpenseList';

const render = (view: TripView, onOpenIncome = vi.fn()) =>
  renderAt(<ExpenseList view={view} onOpen={() => {}} onOpenIncome={onOpenIncome} />);

beforeEach(() => localStorage.setItem('fsl.expenses.mode', 'all'));

describe('the feed with a group fund', () => {
  it('income rows: +amount and who added it', () => {
    render(sportFundView());
    const row = screen.getByText('Thu 2 khách vãng lai').closest('li')!;
    expect(within(row).getByText('+200.000₫')).toBeInTheDocument();
    expect(within(row).getByText('Added to fund · by you')).toBeInTheDocument();
  });

  it('a disabled income is struck through with Disabled by Minh', () => {
    render(sportFundView());
    const row = screen.getByText('Thu vãng lai (nhập trùng)').closest('li')!;
    expect(within(row).getByText('Disabled')).toBeInTheDocument();
    expect(within(row).getByText('Disabled by Minh')).toBeInTheDocument();
  });

  it('fund-paid rows show the whole amount, muted, and Paid from group fund', () => {
    render(sportFundView());
    const row = screen.getByText('Nước sau trận').closest('li')!;
    expect(within(row).getByText('150.000₫')).toHaveClass('fsl-expense-row__amount--fund');
    expect(within(row).getByText('Paid from group fund')).toBeInTheDocument();
  });

  it('one feed, newest first', () => {
    render(sportFundView());
    const titles = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(titles.findIndex((x) => x!.includes('Nước sau trận'))).toBeLessThan(titles.findIndex((x) => x!.includes('Thu 2 khách vãng lai')));
    expect(titles.findIndex((x) => x!.includes('Thu 2 khách vãng lai'))).toBeLessThan(titles.findIndex((x) => x!.includes('Hộp cầu mới')));
  });

  it('income alone is enough to skip the empty state', () => {
    renderAt(<ExpenseList view={sportFundView({ expenses: [] })} onOpen={() => {}} add={<a href="/new">Add</a>} />);
    expect(screen.queryByText('Add the first expense')).toBeNull();
    expect(screen.getByText('Thu 2 khách vãng lai')).toBeInTheDocument();
  });

  it('Mine keeps income I added and drops income others added', () => {
    localStorage.setItem('fsl.expenses.mode', 'mine');
    render(sportMemberView());
    expect(screen.queryByText('Thu 2 khách vãng lai')).toBeNull();
  });

  it('tapping an income row opens it', async () => {
    const open = vi.fn();
    render(sportFundView(), open);
    await userEvent.click(screen.getByText('Thu 2 khách vãng lai'));
    expect(open).toHaveBeenCalledWith('i-1');
  });

  it('renders as before when the view has no fund', () => {
    render(tripView());
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByText(/Added to fund/)).toBeNull();
  });
});

describe('row actions with a group fund', () => {
  it('incomeActions: admins edit and disable or enable; others get nothing', () => {
    const v = sportFundView();
    const deps = { t, navigate: vi.fn(), run: vi.fn() };
    expect(incomeActions(v, v.fund!.incomes[0]!, deps).map((a) => a.id)).toEqual(['edit', 'disable']);
    expect(incomeActions(v, v.fund!.incomes[3]!, deps).map((a) => a.id)).toEqual(['edit', 'enable']);
    expect(incomeActions(sportMemberView(), v.fund!.incomes[0]!, deps)).toEqual([]);
  });

  it('expenseActions offers nothing on a fund-paid expense to a non-admin', () => {
    const v = sportMemberView();
    expect(expenseActions(v, { ...v.expenses[0]!, createdById: PIDS.A }, { t, navigate: vi.fn(), run: vi.fn() })).toEqual([]);
  });
});
