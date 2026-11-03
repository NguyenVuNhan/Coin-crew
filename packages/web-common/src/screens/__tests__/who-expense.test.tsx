import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PickerView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { WhoAreYou } from '../WhoAreYou';

afterEach(() => {
  vi.unstubAllGlobals();
});

const route = {
  route: '/t/t-1/who?expense=e-sport&next=/t/t-1/expenses/e-sport/pay',
  path: '/t/:tripId/who',
};

const expensePicker = (overrides: Partial<PickerView> = {}): PickerView => ({
  people: [
    { id: 'p-lan', name: 'Lan', status: 'active', isMember: true, lastUsedHere: false, activeElsewhere: null, slots: 2 },
    { id: 'p-minh', name: 'Minh', status: 'active', isMember: false, lastUsedHere: false, activeElsewhere: null, slots: 1 },
  ],
  myPick: null,
  account: { name: 'Dũng', needsGender: false },
  myLeftName: { id: 'p-left', name: 'Left' },
  expense: { id: 'e-sport', payerId: 'p-nhan' },
  ...overrides,
});

describe('WhoAreYou in expense mode', () => {
  it('expense mode lists only API rows with the "or friend of" label', async () => {
    const { fetchMock } = mockApi({
      'GET /api/trips/t-1/people/picker': expensePicker(),
    });

    renderAt(<WhoAreYou />, route);

    // Verifies the expense-scoped endpoint was fetched
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/trips/t-1/people/picker?expense=e-sport'),
        expect.anything(),
      );
    });

    // Lan (slots: 2) shows "Lan or Lan's friend" and "2 slots"
    expect(await screen.findByText("Lan or Lan's friend")).toBeInTheDocument();
    expect(screen.getByText('2 slots')).toBeInTheDocument();

    // Minh (slots: 1) shows "Minh" without the friend label or slots sub-line
    expect(screen.getByText('Minh')).toBeInTheDocument();
    expect(screen.queryByText("Minh or Minh's friend")).toBeNull();
    expect(screen.queryByText('1 slots')).toBeNull();

    // In expense mode, join and rejoin options are hidden
    expect(screen.queryByText(/Join as/)).toBeNull();
    expect(screen.queryByText(/Rejoin as/)).toBeNull();
  });

  it('guest row → people/pick then next', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1/people/picker': expensePicker(),
      'POST /api/trips/t-1/people/pick': null,
    });

    renderAt(<WhoAreYou />, route);

    await userEvent.click(await screen.findByRole('radio', { name: /Minh/ }));
    await userEvent.click(screen.getByRole('button', { name: /Continue as Minh/ }));

    await waitFor(() => {
      expect(calls.find((c) => c.path === '/api/trips/t-1/people/pick')?.body).toEqual({
        participantId: 'p-minh',
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-sport/pay');
    });
  });

  it('member 2-slot row → friend endpoint, not people/pick', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1/people/picker': expensePicker(),
      'POST /api/trips/t-1/expenses/e-sport/friend': null,
    });

    renderAt(<WhoAreYou />, route);

    await userEvent.click(await screen.findByRole('radio', { name: /Lan/ }));
    await userEvent.click(screen.getByRole('button', { name: /Continue as Lan/ }));

    await waitFor(() => {
      expect(calls.find((c) => c.path === '/api/trips/t-1/expenses/e-sport/friend')?.body).toEqual({
        participantId: 'p-lan',
      });
    });
    expect(calls.some((c) => c.path === '/api/trips/t-1/people/pick')).toBe(false);
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-sport/pay');
    });
  });

  it('member 1-slot row → sign-in prompt as today', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-1/people/picker': expensePicker({
        people: [
          { id: 'p-lan', name: 'Lan', status: 'active', isMember: true, lastUsedHere: false, activeElsewhere: null, slots: 1 },
          { id: 'p-minh', name: 'Minh', status: 'active', isMember: false, lastUsedHere: false, activeElsewhere: null, slots: 1 },
        ],
      }),
    });

    renderAt(<WhoAreYou />, route);

    // 1-slot member has "Has an account · tap to sign in"
    expect(await screen.findByText('Has an account · tap to sign in')).toBeInTheDocument();

    // Clicking Lan opens the sign-in sheet
    await userEvent.click(screen.getByText('Lan'));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(calls.some((c) => /\/people\/pick$|\/friend$/.test(c.path.split('?')[0]!))).toBe(false);
  });
});
