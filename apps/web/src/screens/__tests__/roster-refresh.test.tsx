import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView, PIDS } from '../../test/fixtures';
import { refetchOnWindowFocus } from '../../api/focus';
import { People } from '../People';
import { ExpenseForm } from '../ExpenseForm';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const peopleRoute = { route: '/t/t-1/people', path: '/t/:tripId/people' };
const newRoute = { route: '/t/t-1/expenses/new', path: '/t/:tripId/expenses/new' };

/** The same group after someone else's window removed Chi (she has history, so she is Left). */
function chiLeft(version = 4): TripView {
  const base = tripView();
  return {
    ...base,
    trip: { ...base.trip, version },
    people: base.people.map((p) => (p.id === PIDS.C ? { ...p, status: 'left', isMember: false } : p)),
  };
}

const leftSection = () => screen.getByRole('region', { name: 'Left the group' });

describe('the roster catches up with changes made in another window', () => {
  it('People marks your own row on a line of its own, so two look-alike names are told apart', async () => {
    mockApi({ 'GET /api/trips/t-1': tripView() });
    renderAt(<People />, peopleRoute);
    const mine = await screen.findByRole('button', { name: 'Minh, Organiser, You' });
    expect(within(mine).getByText('You')).toBeInTheDocument();
    expect(screen.getAllByText('You')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'An, Guest' })).toBeInTheDocument();
  });

  it('People picks up a removal when the window comes back into focus', async () => {
    let removed = false;
    mockApi({ 'GET /api/trips/t-1': () => Response.json(removed ? chiLeft() : tripView()), 'GET /api/trips/t-1/version': { version: 3 } });
    const stop = refetchOnWindowFocus();
    try {
      renderAt(<People />, peopleRoute);
      await screen.findByText('Chi');
      expect(screen.queryByRole('region', { name: 'Left the group' })).toBeNull();
      removed = true;
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      await waitFor(() => expect(within(leftSection()).getByText('Chi')).toBeInTheDocument());
    } finally {
      stop();
    }
  });

  it('People picks up a removal made elsewhere within 20 seconds, without a focus change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let version = 3;
    mockApi({
      'GET /api/trips/t-1': () => Response.json(version === 3 ? tripView() : chiLeft(version)),
      'GET /api/trips/t-1/version': () => Response.json({ version }),
    });
    renderAt(<People />, peopleRoute);
    await screen.findByText('Chi');
    version = 4;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    await waitFor(() => expect(within(leftSection()).getByText('Chi')).toBeInTheDocument());
  });

  it('saving an expense with someone who just left refreshes the form, says who left, and the next save leaves them out', async () => {
    let removed = false;
    let posts = 0;
    const { calls } = mockApi({
      'GET /api/trips/t-1': () => Response.json(removed ? chiLeft() : tripView()),
      'GET /api/trips/t-1/version': { version: 3 },
      'POST /api/trips/t-1/expenses': () => {
        posts += 1;
        if (posts === 1) {
          removed = true;
          return Response.json({ error: { code: 'PERSON_LEFT', message: 'Someone on this expense has left the group.' } }, { status: 409 });
        }
        return Response.json({ expenseId: 'e-new' }, { status: 201 });
      },
    });
    renderAt(<ExpenseForm />, newRoute);
    await userEvent.type(await screen.findByLabelText('What for'), 'Bánh tráng nướng, chợ đêm');
    await userEvent.type(screen.getByLabelText('Amount'), '240.000');
    expect(screen.getByTestId('split-row-Chi')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    expect(await screen.findByText('Someone on this expense left the group. Check the split and try again.')).toBeInTheDocument();
    expect(await screen.findByText("Chi left the group, so they're off this expense.")).toBeInTheDocument();
    expect(screen.queryByTestId('split-row-Chi')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(posts).toBe(2));
    const second = calls.filter((c) => c.method === 'POST' && c.path === '/api/trips/t-1/expenses')[1]!.body as { entries: { participantId: string }[] };
    expect(second.entries.map((e) => e.participantId)).not.toContain(PIDS.C);
  });

  it('when the person who paid leaves while the form is open, it asks who paid instead of sending them', async () => {
    let removed = false;
    mockApi({ 'GET /api/trips/t-1': () => Response.json(removed ? chiLeft() : tripView()), 'GET /api/trips/t-1/version': { version: 3 } });
    const stop = refetchOnWindowFocus();
    try {
      renderAt(<ExpenseForm />, newRoute);
      await userEvent.type(await screen.findByLabelText('What for'), 'Bánh tráng nướng, chợ đêm');
      await userEvent.type(screen.getByLabelText('Amount'), '240.000');
      await userEvent.selectOptions(screen.getByLabelText('Paid by'), PIDS.C);
      removed = true;
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      await waitFor(() => expect(screen.getByLabelText('Paid by')).toHaveValue(''));
      expect(screen.getByRole('option', { name: 'Choose who paid' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add expense' })).toBeDisabled();
    } finally {
      stop();
    }
  });
});
