import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import { ExpenseForm } from '../ExpenseForm';
import { toEntryValue, fromEntryValue } from '../../lib/splitInput';

afterEach(() => {
  vi.unstubAllGlobals();
});

const newRoute = { route: '/t/t-1/expenses/new', path: '/t/:tripId/expenses/new' };
const editRoute = { route: '/t/t-1/expenses/e-5/edit', path: '/t/:tripId/expenses/:expenseId/edit' };
const rowOf = (name: string) => screen.getByTestId(`split-row-${name}`);

describe('splitInput', () => {
  it('turns what people type into entry values', () => {
    expect(toEntryValue('percent', '33.33')).toBe(3333);
    expect(toEntryValue('percent', '33,33')).toBe(3333);
    expect(toEntryValue('shares', '1.5')).toBe(150);
    expect(toEntryValue('shares', '2')).toBe(200);
    expect(toEntryValue('amounts', '50k')).toBe(50000);
    expect(toEntryValue('adjust', '-20.000')).toBe(-20000);
    expect(toEntryValue('adjust', '0')).toBe(0);
    expect(toEntryValue('percent', 'abc')).toBeNull();
  });
  it('and back for editing', () => {
    expect(fromEntryValue('percent', 3333)).toBe('33.33');
    expect(fromEntryValue('shares', 150)).toBe('1.5');
    expect(fromEntryValue('amounts', 50000)).toBe('50.000');
    expect(fromEntryValue('adjust', -20000)).toBe('-20.000');
  });
});

describe('ExpenseForm', () => {
  it('splits equally between everyone ticked', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('Amount'), '180.000');
    for (const name of ['Minh', 'An', 'Bình', 'Chi']) expect(within(rowOf(name)).getByText('45.000₫')).toBeInTheDocument();
  });

  it('understands 1,5tr', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('Amount'), '1,5tr');
    expect(screen.getAllByText('1.500.000₫').length).toBeGreaterThan(0);
  });

  it('exact amounts that do not add up block saving', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('What for'), 'Lẩu');
    await userEvent.type(screen.getByLabelText('Amount'), '100.000');
    await userEvent.click(screen.getByRole('tab', { name: 'Amounts' }));
    await userEvent.type(screen.getByLabelText('Amount for Minh'), '50.000');
    await userEvent.type(screen.getByLabelText('Amount for An'), '20.000');
    expect(screen.getByText("The amounts don't add up to the total.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();
  });

  it('a guest sends for approval and the body is what the API expects', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': guestChiView(),
      'POST /api/trips/t-1/expenses': () => Response.json({ expenseId: 'e-9' }, { status: 201 }),
    });
    renderAt(<ExpenseForm />, newRoute);
    expect(await screen.findByText('A group member checks it before it counts.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('What for'), 'Bánh tráng nướng, chợ đêm');
    await userEvent.type(screen.getByLabelText('Amount'), '180k');
    expect(screen.getByLabelText('Paid by')).toHaveValue(PIDS.C);
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    const body = calls.find((c) => c.method === 'POST')?.body as Record<string, unknown>;
    expect(body).toMatchObject({ description: 'Bánh tráng nướng, chợ đêm', amount: 180000, payerId: PIDS.C, mode: 'equal' });
    expect(body.spentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.entries).toEqual([PIDS.M, PIDS.A, PIDS.B, PIDS.C].map((participantId) => ({ participantId, value: 1 })));
  });

  it('unticking someone leaves them out', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('Amount'), '90.000');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include Bình' }));
    expect(within(rowOf('Minh')).getByText('30.000₫')).toBeInTheDocument();
    expect(within(rowOf('Bình')).queryByText(/₫/)).not.toBeInTheDocument();
  });

  it('edit mode fills the form and saves with PATCH', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1': guestChiView(),
      'PATCH /api/trips/t-1/expenses/e-5': null,
    });
    renderAt(<ExpenseForm />, editRoute);
    expect(await screen.findByLabelText('What for')).toHaveValue('Bánh tráng nướng, chợ đêm');
    expect(screen.getByLabelText('Amount')).toHaveValue('180.000');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
  });
});
