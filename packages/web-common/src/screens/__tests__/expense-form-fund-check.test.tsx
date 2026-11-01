import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { sportFundView } from '../../test/fundFixtures';
import { ExpenseForm } from '../ExpenseForm';

afterEach(() => {
  vi.unstubAllGlobals();
});

const newRoute = { route: '/t/t-1/expenses/new', path: '/t/:tripId/expenses/new' };
const editRoute = (id: string) => ({ route: `/t/t-1/expenses/${id}/edit`, path: '/t/:tripId/expenses/:expenseId/edit' });
const incomeEditRoute = (id: string) => ({ route: `/t/t-1/fund/${id}/edit`, path: '/t/:tripId/fund/:incomeId/edit' });
const atBalance = (balance: number, overrides: Partial<TripView> = {}): TripView =>
  sportFundView({ fund: { ...sportFundView().fund!, balance }, ...overrides });
const overLimit = /^The fund has only/;

// The forms refuse only what the API refuses: a save that takes more from the fund and leaves it below 0₫.
describe('fund checks in the forms', () => {
  it('at 0₫, choosing Group fund says so at once and keeps Save disabled (spec §9.1)', async () => {
    mockApi({ 'GET /api/trips/t-1': atBalance(0) });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.selectOptions(await screen.findByLabelText('Paid by'), 'Group fund · 0₫');
    expect(screen.getByText('The fund has only 0₫. Lower the amount or choose who paid.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('What for'), 'Nước sau trận');
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Amount'), '50k');
    expect(screen.getByText(overLimit)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();
  });

  it('with money in the fund, nothing is said until an amount is typed', async () => {
    mockApi({ 'GET /api/trips/t-1': atBalance(400000) });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.selectOptions(await screen.findByLabelText('Paid by'), 'Group fund · 400.000₫');
    expect(screen.queryByText(overLimit)).toBeNull();
    expect(screen.queryByText(/^Fund after this/)).toBeNull();
  });

  it('below 0₫ after a race, a fund-paid expense can still get a new description', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': atBalance(-50000),
      'PATCH /api/trips/t-1/expenses/e-f1': { expenseId: 'e-f9', rootId: 'e-f1' },
    });
    renderAt(<ExpenseForm />, editRoute('e-f1'));
    const what = await screen.findByLabelText('What for');
    await userEvent.clear(what);
    await userEvent.type(what, 'Nước suối sau trận');
    expect(screen.queryByText(overLimit)).toBeNull();
    expect(screen.getByText('Fund after this: -50.000₫')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ description: 'Nước suối sau trận', amount: 150000 }),
    );
  });

  it('below 0₫ after a race, raising a fund-paid expense is refused', async () => {
    mockApi({ 'GET /api/trips/t-1': atBalance(-50000) });
    renderAt(<ExpenseForm />, editRoute('e-f1'));
    const amount = await screen.findByLabelText('Amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '160k');
    expect(screen.getByText(overLimit)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('a disabled fund-paid expense can be edited above the balance: it takes nothing from the fund', async () => {
    const base = atBalance(100000);
    const { calls } = mockApi({
      'GET /api/trips/t-1': { ...base, expenses: base.expenses.map((e) => (e.id === 'e-f1' ? { ...e, status: 'disabled' } : e)) },
      'PATCH /api/trips/t-1/expenses/e-f1': { expenseId: 'e-f9', rootId: 'e-f1' },
    });
    renderAt(<ExpenseForm />, editRoute('e-f1'));
    const amount = await screen.findByLabelText('Amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '300k');
    expect(screen.queryByText(overLimit)).toBeNull();
    expect(screen.getByText('Fund after this: 100.000₫')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ amount: 300000 }));
  });

  it('below 0₫ after a race, an income can still get a new note, but not a lower amount', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': atBalance(-50000),
      'PATCH /api/trips/t-1/fund/incomes/i-1': {},
    });
    renderAt(<ExpenseForm />, incomeEditRoute('i-1'));
    const amount = await screen.findByLabelText('Amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '150k');
    expect(screen.getByText('Keep at least 200.000₫: the rest is already spent.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await userEvent.clear(amount);
    await userEvent.type(amount, '200k');
    const note = screen.getByLabelText('Note');
    await userEvent.clear(note);
    await userEvent.type(note, 'Thu 2 khách vãng lai (Thứ 5)');
    expect(screen.queryByText(/^Keep at least/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ amount: 200000, description: 'Thu 2 khách vãng lai (Thứ 5)' }),
    );
  });
});
