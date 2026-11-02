import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExpenseInput } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView, PIDS } from '../../test/fixtures';
import { sportFundView, sportMemberView } from '../../test/fundFixtures';
import { ExpenseForm } from '../ExpenseForm';

afterEach(() => {
  vi.unstubAllGlobals();
});

const newRoute = { route: '/t/t-1/expenses/new', path: '/t/:tripId/expenses/new' };
const editRoute = (id: string) => ({ route: `/t/t-1/expenses/${id}/edit`, path: '/t/:tripId/expenses/:expenseId/edit' });
const pickFund = async () => userEvent.selectOptions(await screen.findByLabelText('Paid by'), 'Group fund · 400.000₫');

describe('Paid by: Group fund', () => {
  it('admins get Group fund · 400.000₫ first in Paid by', async () => {
    mockApi({ 'GET /api/trips/t-1': sportFundView() });
    renderAt(<ExpenseForm />, newRoute);
    const options = within(await screen.findByLabelText('Paid by')).getAllByRole('option');
    expect(options[0]).toHaveTextContent('Group fund · 400.000₫');
    // A new expense still starts with me paying.
    expect(screen.getByRole('option', { name: 'Minh (me)', selected: true })).toBeInTheDocument();
  });

  it('choosing it swaps the split for the fund panel and saves a fund-paid body', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': sportFundView(), 'POST /api/trips/t-1/expenses': { expenseId: 'e-9' } });
    renderAt(<ExpenseForm />, newRoute);
    await pickFund();
    expect(screen.queryByRole('button', { name: /^Split between/ })).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByLabelText('Court')).toBeNull();
    expect(screen.getByText('Paid from the group fund')).toBeInTheDocument();
    expect(screen.getByText('Nobody owes a share.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('What for'), 'Nước sau trận');
    await userEvent.type(screen.getByLabelText('Amount'), '150k');
    expect(screen.getByText('Fund after this: 250.000₫')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
        description: 'Nước sau trận',
        amount: 150000,
        payerId: PIDS.M,
        mode: 'equal',
        entries: [],
        meta: { paidFromFund: true },
      }),
    );
  });

  it('over the fund: the message and Save disabled', async () => {
    mockApi({ 'GET /api/trips/t-1': sportFundView() });
    renderAt(<ExpenseForm />, newRoute);
    await pickFund();
    await userEvent.type(screen.getByLabelText('What for'), 'Liên hoan cuối tháng');
    await userEvent.type(screen.getByLabelText('Amount'), '500k');
    expect(screen.getByText('The fund has only 400.000₫. Lower the amount or choose who paid.')).toBeInTheDocument();
    expect(screen.queryByText(/^Fund after this/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();
    // Exactly what the fund holds is fine.
    await userEvent.clear(screen.getByLabelText('Amount'));
    await userEvent.type(screen.getByLabelText('Amount'), '400k');
    expect(screen.getByText('Fund after this: 0₫')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeEnabled();
  });

  it('carries a typed sport total into Amount', async () => {
    mockApi({ 'GET /api/trips/t-1': sportFundView() });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('Court'), '150k');
    await pickFund();
    expect(screen.getByLabelText('Amount')).toHaveValue('150.000');
    expect(screen.getByText('Fund after this: 250.000₫')).toBeInTheDocument();
  });

  it('choosing a person again restores the split and drops the fund flag', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': sportFundView(), 'POST /api/trips/t-1/expenses': { expenseId: 'e-9' } });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('Court'), '200k');
    await pickFund();
    await userEvent.selectOptions(screen.getByLabelText('Paid by'), 'Minh (me)');
    expect(screen.getByRole('button', { name: /^Split between/ })).toBeInTheDocument();
    expect(screen.queryByText('Paid from the group fund')).toBeNull();
    // The sport cost card comes back as it was.
    expect(screen.getByLabelText('Court')).toHaveValue('200k');
    await userEvent.type(screen.getByLabelText('What for'), 'Sân thứ 5');
    await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const body = calls.find((c) => c.method === 'POST')!.body as ExpenseInput;
    expect(body.meta?.paidFromFund).toBeUndefined();
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body).toMatchObject({ amount: 200000, payerId: PIDS.M });
  });

  it('editing a fund-paid expense at 0₫ balance still saves its own amount', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': sportFundView({ fund: { ...sportFundView().fund!, balance: 0 } }),
      'PATCH /api/trips/t-1/expenses/e-f1': { expenseId: 'e-f9', rootId: 'e-f1' },
    });
    renderAt(<ExpenseForm />, editRoute('e-f1'));
    expect(await screen.findByText('Fund after this: 0₫')).toBeInTheDocument();
    // It opens on the fund, which can spend this expense's own amount again.
    expect(screen.getByRole('option', { name: 'Group fund · 150.000₫', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({
        amount: 150000,
        payerId: PIDS.M,
        entries: [],
        meta: { paidFromFund: true },
      }),
    );
  });

  it('no Group fund for a non-admin', async () => {
    mockApi({ 'GET /api/trips/t-1': sportMemberView() });
    renderAt(<ExpenseForm />, newRoute);
    const select = await screen.findByLabelText('Paid by');
    expect(within(select).queryByRole('option', { name: /Group fund/ })).toBeNull();
  });

  it('no Group fund in a trip group', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    const select = await screen.findByLabelText('Paid by');
    expect(within(select).queryByRole('option', { name: /Group fund/ })).toBeNull();
  });

  it('a non-admin editing a fund-paid expense gets the not-yours screen', async () => {
    const base = sportMemberView();
    mockApi({
      'GET /api/trips/t-1': {
        ...base,
        expenses: base.expenses.map((e) => (e.id === 'e-f1' ? { ...e, createdById: PIDS.A } : e)),
      },
    });
    renderAt(<ExpenseForm />, editRoute('e-f1'));
    expect(await screen.findByText('Only the person who added this expense can edit it.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Paid by')).toBeNull();
  });
});
