import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView } from '../../test/fixtures';
import { ExpenseForm } from '../ExpenseForm';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const editRoute = { route: '/t/t-1/expenses/e-5/edit', path: '/t/:tripId/expenses/:expenseId/edit' };

describe('ExpenseForm when someone handled the expense meanwhile', () => {
  it('edit refused as already handled reloads the trip', async () => {
    mockApi({
      'GET /api/trips/t-1': guestChiView(),
      'PATCH /api/trips/t-1/expenses/e-5': () =>
        Response.json({ error: { code: 'ALREADY_HANDLED', message: 'Someone already handled this.' } }, { status: 409 }),
    });
    const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    renderAt(<ExpenseForm />, editRoute);
    await screen.findByLabelText('What for');
    invalidate.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trip', 't-1'] }));
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-5/edit');
  });
});
