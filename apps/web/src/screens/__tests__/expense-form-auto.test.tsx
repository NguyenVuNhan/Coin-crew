import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExpenseView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView, PIDS } from '../../test/fixtures';
import { ExpenseForm } from '../ExpenseForm';

afterEach(() => {
  vi.unstubAllGlobals();
});

const newRoute = { route: '/t/t-1/expenses/new', path: '/t/:tripId/expenses/new' };
const editRoute = { route: '/t/t-1/expenses/e-6/edit', path: '/t/:tripId/expenses/:expenseId/edit' };
const rowOf = (name: string) => screen.getByTestId(`split-row-${name}`);
const everyone = [PIDS.M, PIDS.A, PIDS.B, PIDS.C];

/** A 180.000₫ percent expense of Minh's with the given boxes (null = left blank). */
const percentExpense = (values: (number | null)[], amounts: number[]): ExpenseView => ({
  id: 'e-6', description: 'Lẩu nấm', amount: 180000, spentOn: '2026-10-20', payerId: PIDS.M, mode: 'percent', status: 'approved',
  rejectReason: null, disabledByName: null, createdById: PIDS.M,
  shares: everyone.map((participantId, i) => ({ participantId, amount: amounts[i]!, inputValue: values[i] as number | null })),
});
const withExpense = (e: ExpenseView) => tripView({ expenses: [e, ...tripView().expenses] });

async function start(amount: string, mode: 'Percent' | 'Exact amounts') {
  await userEvent.type(await screen.findByLabelText('What for'), 'Lẩu nấm');
  await userEvent.type(screen.getByLabelText('Amount'), amount);
  await userEvent.click(screen.getByRole('radio', { name: mode }));
}
const openSheet = () => userEvent.click(screen.getByRole('button', { name: /^Split between/ }));
const postedEntries = (calls: { method: string; body: unknown }[]) =>
  (calls.find((c) => c.method === 'POST')?.body as { entries: unknown }).entries;

describe('ExpenseForm, blank boxes share what is left', () => {
  it('percent: 40% for Minh gives the other three 20% each', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await start('1.000.000', 'Percent');
    await userEvent.type(screen.getByLabelText('Percent for Minh'), '40');
    const an = screen.getByLabelText('Percent for An');
    expect(an).toHaveValue('');
    expect(an).toHaveAttribute('placeholder', '20');
    expect(within(rowOf('An')).getByText('200.000₫')).toBeInTheDocument();
    expect(screen.getByText('By percent · 4 people · 3 share the 60% left')).toBeInTheDocument();
  });

  it('exact: 400.000 for Minh gives the others 200.000 each', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await start('1.000.000', 'Exact amounts');
    await userEvent.type(screen.getByLabelText('Amount for Minh'), '400.000');
    expect(screen.getByLabelText('Amount for An')).toHaveAttribute('placeholder', '200.000');
    expect(screen.getByText('Exact amounts · 4 people · 3 share 600.000₫ left')).toBeInTheDocument();
  });

  it('one blank box is named', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await start('1.000.000', 'Percent');
    await userEvent.type(screen.getByLabelText('Percent for Minh'), '50');
    await userEvent.type(screen.getByLabelText('Percent for An'), '30');
    await userEvent.type(screen.getByLabelText('Percent for Bình'), '10');
    expect(screen.getByText('By percent · 4 people · 10% left for Chi')).toBeInTheDocument();
  });

  it('nothing left: they owe nothing and it still saves', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': tripView(),
      'POST /api/trips/t-1/expenses': () => Response.json({ expenseId: 'e-9' }, { status: 201 }),
    });
    renderAt(<ExpenseForm />, newRoute);
    await start('1.000.000', 'Percent');
    await userEvent.type(screen.getByLabelText('Percent for Minh'), '60');
    await userEvent.type(screen.getByLabelText('Percent for An'), '40');
    expect(screen.getByText('By percent · 4 people · 2 owe nothing')).toBeInTheDocument();
    const add = screen.getByRole('button', { name: 'Add expense' });
    expect(add).toBeEnabled();
    await userEvent.click(add);
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(postedEntries(calls)).toEqual([
      { participantId: PIDS.M, value: 6000 }, { participantId: PIDS.A, value: 4000 },
      { participantId: PIDS.B, value: null }, { participantId: PIDS.C, value: null },
    ]);
  });

  it('over is still an error', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await start('1.000.000', 'Percent');
    await userEvent.type(screen.getByLabelText('Percent for Minh'), '70');
    await userEvent.type(screen.getByLabelText('Percent for An'), '40');
    expect(screen.getByText('By percent · 4 people · 10% over')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();
  });

  it('a typed 0 is sent as 0', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': tripView(),
      'POST /api/trips/t-1/expenses': () => Response.json({ expenseId: 'e-9' }, { status: 201 }),
    });
    renderAt(<ExpenseForm />, newRoute);
    await start('100.000', 'Exact amounts');
    await userEvent.type(screen.getByLabelText('Amount for Minh'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(postedEntries(calls)).toEqual([
      { participantId: PIDS.M, value: 0 }, { participantId: PIDS.A, value: null },
      { participantId: PIDS.B, value: null }, { participantId: PIDS.C, value: null },
    ]);
  });

  it('shares and adjust boxes start empty with placeholders', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('Amount'), '180.000');
    await userEvent.click(screen.getByRole('radio', { name: 'Shares' }));
    expect(screen.getByLabelText('Shares for An')).toHaveValue('');
    expect(screen.getByLabelText('Shares for An')).toHaveAttribute('placeholder', '1');
    expect(within(rowOf('An')).getByText('45.000₫')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Adjust' }));
    expect(screen.getByLabelText('Adjustment for An')).toHaveValue('');
    expect(screen.getByLabelText('Adjustment for An')).toHaveAttribute('placeholder', '0');
  });
});

describe('ExpenseForm, editing blank boxes', () => {
  it('editing restores blank boxes', async () => {
    mockApi({ 'GET /api/trips/t-1': withExpense(percentExpense([4000, null, null, null], [72000, 36000, 36000, 36000])) });
    renderAt(<ExpenseForm />, editRoute);
    expect(await screen.findByLabelText('Percent for Minh')).toHaveValue('40');
    expect(screen.getByLabelText('Percent for An')).toHaveValue('');
    expect(screen.getByLabelText('Percent for An')).toHaveAttribute('placeholder', '20');
  });

  it('an old percent expense opens filled; clearing a box makes it automatic', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': withExpense(percentExpense([4000, 2000, 2000, 2000], [72000, 36000, 36000, 36000])),
      'PATCH /api/trips/t-1/expenses/e-6': null,
    });
    renderAt(<ExpenseForm />, editRoute);
    const chi = await screen.findByLabelText('Percent for Chi');
    expect(chi).toHaveValue('20');
    await userEvent.clear(chi);
    expect(chi).toHaveAttribute('placeholder', '20');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect((calls.find((c) => c.method === 'PATCH')?.body as { entries: unknown }).entries).toEqual([
      { participantId: PIDS.M, value: 4000 }, { participantId: PIDS.A, value: 2000 },
      { participantId: PIDS.B, value: 2000 }, { participantId: PIDS.C, value: null },
    ]);
  });
});

describe('ExpenseForm, choosing who is in', () => {
  it('the line opens the sheet, and unticking there takes the row away', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await screen.findByLabelText('Amount');
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Bình' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('split-row-Bình')).toBeNull();
    expect(screen.getByText('Split between · 3 of 4')).toBeInTheDocument();
  });

  it('Use on a recent group', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await screen.findByLabelText('Amount');
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Use the people from Cà phê Túi Mơ To' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    for (const name of ['Minh', 'An', 'Chi']) expect(rowOf(name)).toBeInTheDocument();
    expect(screen.queryByTestId('split-row-Bình')).toBeNull();
  });

  it('taking someone out and back keeps what was typed', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await start('100.000', 'Exact amounts');
    await userEvent.type(screen.getByLabelText('Amount for An'), '30.000');
    await openSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Remove An' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Exact amounts · 3 people · 3 share 100.000₫ left')).toBeInTheDocument();
    await openSheet();
    await userEvent.type(screen.getByRole('textbox', { name: 'Add people' }), 'an{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByLabelText('Amount for An')).toHaveValue('30.000');
  });
});
