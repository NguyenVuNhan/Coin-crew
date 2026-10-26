import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView, PIDS } from '../../test/fixtures';
import { ExpenseForm } from '../ExpenseForm';

afterEach(() => {
  vi.unstubAllGlobals();
});

const newRoute = { route: '/t/t-1/expenses/new', path: '/t/:tripId/expenses/new' };
const editE1 = { route: '/t/t-1/expenses/e-1/edit', path: '/t/:tripId/expenses/:expenseId/edit' };
const rowOf = (name: string) => screen.getByTestId(`split-row-${name}`);

/** Chi left the group; she is still on the homestay expense (e-1). */
function chiLeft(): TripView {
  const base = tripView();
  return { ...base, people: base.people.map((p) => (p.id === PIDS.C ? { ...p, status: 'left', isMember: false } : p)) };
}

describe('ExpenseForm with people who left', () => {
  it('a new expense does not offer people who left', async () => {
    mockApi({ 'GET /api/trips/t-1': chiLeft() });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('Amount'), '180.000');
    for (const name of ['Minh', 'An', 'Bình']) expect(within(rowOf(name)).getByText('60.000₫')).toBeInTheDocument();
    expect(screen.queryByText('Chi')).toBeNull();
  });

  it('editing an expense keeps a left person already on it, marked Left', async () => {
    mockApi({ 'GET /api/trips/t-1': chiLeft() });
    renderAt(<ExpenseForm />, editE1);
    expect(within(await screen.findByTestId('split-row-Chi')).getByText('Left')).toBeInTheDocument();
    expect(within(rowOf('Minh')).queryByText('Left')).toBeNull();
  });
});
