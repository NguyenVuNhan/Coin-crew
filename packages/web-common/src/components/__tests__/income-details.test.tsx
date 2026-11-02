import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { sportFundView, sportMemberView } from '../../test/fundFixtures';
import { IncomeDetails } from '../IncomeDetails';
import { ExpenseDetails } from '../ExpenseDetails';
import { TripRoute } from '../../screens/TripRoute';

afterEach(() => {
  vi.unstubAllGlobals();
});

let v: TripView;
const at = (id: string) => renderAt(<IncomeDetails view={v} incomeId={id} onClose={() => {}} />);

describe('IncomeDetails', () => {
  it('admin sees amount, date, added by, Edit and Disable', () => {
    v = sportFundView();
    at('i-2');
    expect(screen.getByText('+300.000₫')).toBeInTheDocument();
    expect(screen.getByText(/Minh · /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Disable/ })).toBeInTheDocument();
  });

  it('FUND_SHORT on Disable says how much is already spent', async () => {
    v = sportFundView({ fund: { ...sportFundView().fund!, balance: 50000 } });
    mockApi({
      'POST /api/trips/t-1/fund/incomes/i-2/disable': () =>
        Response.json({ error: { code: 'FUND_SHORT', message: '' } }, { status: 409 }),
    });
    at('i-2');
    await userEvent.click(screen.getByRole('button', { name: /Disable/ }));
    expect(await screen.findByText("Can't disable: 250.000₫ of this money is already spent.")).toBeInTheDocument();
  });

  it('Roll back posts the older version', async () => {
    const base = sportFundView();
    const old = { id: 'i-0', amount: 200000, spentOn: '2026-10-20', description: 'Anh Minh donate', createdById: base.fund!.incomes[0]!.createdById, createdAt: '2026-10-20T10:00' };
    const incomes = base.fund!.incomes.map((i) => (i.id === 'i-2' ? { ...i, history: [old] } : i));
    v = sportFundView({ fund: { ...base.fund!, incomes } });
    const { calls } = mockApi({ 'POST /api/trips/t-1/fund/incomes/i-2/rollback': { incomeId: 'i-2' } });
    at('i-2');
    await userEvent.click(screen.getByRole('button', { name: /Roll back/ }));
    expect(calls[0]!.path).toBe('/api/trips/t-1/fund/incomes/i-2/rollback');
    expect(calls[0]!.body).toEqual({ targetHistoryId: 'i-0' });
  });

  it('a disabled income offers Enable', () => {
    v = sportFundView();
    at('i-4');
    expect(screen.getByRole('button', { name: /Enable/ })).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('non-admins get a read-only page', () => {
    v = sportMemberView();
    at('i-1');
    expect(screen.getByText('Only admins can change fund income.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
  });

  it('an unknown id shows not found', () => {
    v = sportFundView();
    at('nope');
    expect(screen.getByText("This isn't in the trip any more.")).toBeInTheDocument();
  });

  it('/t/t-1/fund/i-1 opens the income page', async () => {
    mockApi({ 'GET /api/trips/t-1': sportFundView() });
    renderAt(<TripRoute />, { route: '/t/t-1/fund/i-1', path: '/t/:tripId/fund/:incomeId' });
    expect(await screen.findByText('Fund income')).toBeInTheDocument();
    expect(screen.getByText('Thu 2 khách vãng lai')).toBeInTheDocument();
  });

  it('a fund-paid expense says Group fund paid and nobody owes a share', () => {
    renderAt(<ExpenseDetails view={sportFundView()} expenseId="e-f1" onClose={() => {}} />);
    expect(screen.getByText('Group fund')).toBeInTheDocument();
    expect(screen.getByText('Nobody owes a share. The money came out of the group fund.')).toBeInTheDocument();
  });
});
