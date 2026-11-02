import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { ExpenseHistoryItem, ExpenseView, TripView } from '@fsl/core';
import { renderAt } from '../../test/render';
import { PIDS } from '../../test/fixtures';
import { sportFundView, sportMemberView } from '../../test/fundFixtures';
import { ExpenseHistoryList } from '../ExpenseHistoryList';

const version = (extra: Partial<ExpenseHistoryItem>): ExpenseHistoryItem => ({
  id: 'h-1', description: 'Nước', amount: 120000, spentOn: '2026-10-25', payerId: PIDS.M, mode: 'equal',
  createdById: PIDS.M, createdAt: '2026-10-25T10:00', shares: [], meta: { paidFromFund: true }, ...extra,
});

const show = (view: TripView, expense: ExpenseView) => renderAt(<ExpenseHistoryList view={view} expense={expense} />);
const fundPaid = (view: TripView) => ({ ...view.expenses.find((e) => e.id === 'e-f1')!, history: [version({})] });
const paidByMinh = (view: TripView) => ({ ...view.expenses.find((e) => e.id === 'e-1')!, history: [version({})] });

describe('history of a fund-paid expense', () => {
  it('a fund-paid version is paid by Group fund, not by the admin who recorded it (spec §4.2)', () => {
    const v = sportFundView();
    show(v, fundPaid(v));
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Group fund')).toBeInTheDocument();
    expect(within(item).queryByText('Minh')).toBeNull();
  });

  it('a version someone paid still names them', () => {
    const v = sportFundView();
    show(v, { ...fundPaid(v), history: [version({ meta: null, shares: [{ participantId: PIDS.M, amount: 120000, inputValue: null }] })] });
    expect(within(screen.getByRole('listitem')).getByText('Minh')).toBeInTheDocument();
  });

  it('fund admins can roll back a fund-paid expense', () => {
    const v = sportFundView();
    show(v, fundPaid(v));
    expect(screen.getByRole('button', { name: 'Roll back to this update' })).toBeInTheDocument();
  });

  it('a member without manage_fund cannot roll back a fund-paid expense', () => {
    const v = sportMemberView();
    show(v, fundPaid(v));
    expect(screen.queryByRole('button', { name: 'Roll back to this update' })).toBeNull();
  });

  it('nor roll an expense back to a fund-paid version', () => {
    const v = sportMemberView();
    show(v, paidByMinh(v));
    expect(screen.queryByRole('button', { name: 'Roll back to this update' })).toBeNull();
  });

  it('versions with no fund in them keep Roll back for members', () => {
    const v = sportMemberView();
    show(v, { ...paidByMinh(v), history: [version({ meta: null, shares: [{ participantId: PIDS.M, amount: 120000, inputValue: null }] })] });
    expect(screen.getByRole('button', { name: 'Roll back to this update' })).toBeInTheDocument();
  });
});
