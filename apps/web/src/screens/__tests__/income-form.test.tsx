import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { sportFundView, sportMemberView } from '../../test/fundFixtures';
import { ExpenseForm } from '../ExpenseForm';

const newRoute = (q = '') => ({ route: `/t/t-1/expenses/new${q}`, path: '/t/:tripId/expenses/new' });
const editRoute = (id: string) => ({ route: `/t/t-1/fund/${id}/edit`, path: '/t/:tripId/fund/:incomeId/edit' });
const expenseEditRoute = (id: string) => ({ route: `/t/t-1/expenses/${id}/edit`, path: '/t/:tripId/expenses/:expenseId/edit' });

describe('fund income form', () => {
  it('admins in a sport group see the switcher; Fund income shows Amount, Date and Note', async () => {
    mockApi({ 'GET /api/trips/t-1': sportFundView() });
    renderAt(<ExpenseForm />, newRoute());
    await userEvent.click(await screen.findByRole('tab', { name: 'Fund income' }));
    expect(screen.getByRole('tab', { name: 'Fund income' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Note')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    expect(screen.queryByText('Paid by')).toBeNull();
  });

  it('adds income', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': sportFundView(),
      'POST /api/trips/t-1/fund/incomes': { incomeId: 'i-9' },
    });
    renderAt(<ExpenseForm />, newRoute('?type=income'));
    await userEvent.type(await screen.findByLabelText('Amount'), '200k');
    expect(screen.getAllByText('200.000₫').length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText('Note'), 'Thu 2 khách vãng lai');
    await userEvent.click(screen.getByRole('button', { name: 'Add to fund' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
        amount: 200000,
        spentOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        description: 'Thu 2 khách vãng lai',
      }),
    );
  });

  it('an amount it cannot read keeps Add to fund disabled', async () => {
    mockApi({ 'GET /api/trips/t-1': sportFundView() });
    renderAt(<ExpenseForm />, newRoute('?type=income'));
    await userEvent.type(await screen.findByLabelText('Amount'), '2 trăm');
    await userEvent.type(screen.getByLabelText('Note'), 'Thu');
    expect(screen.getByText('Enter an amount like 180.000, 50k or 1,5tr.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to fund' })).toBeDisabled();
  });

  it('editing below what is spent says Keep at least 250.000₫', async () => {
    mockApi({ 'GET /api/trips/t-1': sportFundView({ fund: { ...sportFundView().fund!, balance: 50000 } }) });
    renderAt(<ExpenseForm />, editRoute('i-2'));
    const amount = await screen.findByLabelText('Amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '200k');
    expect(screen.getByText('Keep at least 250.000₫: the rest is already spent.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('saves an edited income with PATCH', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': sportFundView(),
      'PATCH /api/trips/t-1/fund/incomes/i-2': {},
    });
    renderAt(<ExpenseForm />, editRoute('i-2'));
    const amount = await screen.findByLabelText('Amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '350k');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
        amount: 350000,
        spentOn: '2026-10-26',
        description: 'Anh Minh donate quỹ',
      }),
    );
  });

  it('non-admin ?type=income gets the expense form', async () => {
    mockApi({ 'GET /api/trips/t-1': sportMemberView() });
    renderAt(<ExpenseForm />, newRoute('?type=income'));
    expect(await screen.findByText('Paid by')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('income edit URL for a non-admin is read-only', async () => {
    mockApi({ 'GET /api/trips/t-1': sportMemberView() });
    renderAt(<ExpenseForm />, editRoute('i-1'));
    expect(await screen.findByText('Only admins can change fund income.')).toBeInTheDocument();
  });

  it('an unknown income id is not found', async () => {
    mockApi({ 'GET /api/trips/t-1': sportFundView() });
    renderAt(<ExpenseForm />, editRoute('i-404'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByLabelText('Note')).toBeNull();
  });

  it('no switcher in a trip group or when editing an expense', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    const first = renderAt(<ExpenseForm />, newRoute());
    expect(await screen.findByText('Paid by')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    first.unmount();

    mockApi({ 'GET /api/trips/t-1': sportFundView() });
    renderAt(<ExpenseForm />, expenseEditRoute('e-1'));
    expect(await screen.findByText('Paid by')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});
