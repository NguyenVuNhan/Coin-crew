import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView, GroupPerson } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { ExpenseForm } from '../ExpenseForm';

afterEach(() => {
  vi.unstubAllGlobals();
});

const directRoute = { route: '/t/t-led/expenses/new', path: '/t/:tripId/expenses/new' };
const groupRoute = { route: '/t/t-1/expenses/new', path: '/t/:tripId/expenses/new' };

const candidates: GroupPerson[] = [
  { participantId: 'g-linh', name: 'Linh', userId: null, tripName: 'Badminton' },
];

function directTripView(): TripView {
  return {
    trip: {
      id: 't-led',
      name: 'Quick expenses',
      currency: 'VND',
      fewestTransfers: true,
      archived: false,
      version: 1,
      total: 0,
      preset: 'direct',
    },
    me: {
      kind: 'member',
      participantId: 'led-o',
      participantPending: false,
      isOrganiser: true,
    },
    people: [
      { id: 'led-o', name: 'An', status: 'active', isMember: true, bank: 'none' },
      { id: 'led-m', name: 'Minh', status: 'active', isMember: false, bank: 'none' },
    ],
    balances: { 'led-o': 0, 'led-m': 0 },
    suggestions: [],
    expenses: [],
    payments: [],
    myBalance: null,
    approvals: [],
    links: null,
  };
}

describe('Quick expenses (direct trip)', () => {
  it('Title is "New expense"; "Who paid" defaults to me and can be changed to Minh', async () => {
    mockApi({
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': candidates,
    });
    renderAt(<ExpenseForm />, directRoute);

    expect(await screen.findByRole('heading', { level: 1, name: 'New expense' })).toBeInTheDocument();

    const payerSelect = screen.getByLabelText('Paid by');
    expect(payerSelect).toHaveValue('led-o');

    await userEvent.selectOptions(payerSelect, 'led-m');
    expect(payerSelect).toHaveValue('led-m');
  });

  it('The split starts with only me chosen', async () => {
    mockApi({
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': candidates,
    });
    renderAt(<ExpenseForm />, directRoute);

    await screen.findByRole('heading', { level: 1, name: 'New expense' });

    expect(screen.getByTestId('split-row-An')).toBeInTheDocument();
    expect(screen.queryByTestId('split-row-Minh')).toBeNull();
  });

  it('Opening the people sheet and typing "lin" shows candidate "Linh" and tapping posts { participantId: "g-linh" }', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': candidates,
      'POST /api/me/ledger/people': () => Response.json({ participantId: 'led-l' }, { status: 201 }),
    });
    renderAt(<ExpenseForm />, directRoute);

    await screen.findByRole('heading', { level: 1, name: 'New expense' });

    await userEvent.click(screen.getByRole('button', { name: /^Split between/ }));

    const searchInput = screen.getByRole('textbox', { name: 'Add people' });
    await userEvent.type(searchInput, 'lin');

    expect(await screen.findByText('From your groups')).toBeInTheDocument();
    const candidateBtn = screen.getByTestId('candidate-g-linh');
    expect(candidateBtn).toBeInTheDocument();
    expect(within(candidateBtn).getByText('Linh')).toBeInTheDocument();
    expect(within(candidateBtn).getByText('Badminton')).toBeInTheDocument();

    await userEvent.click(candidateBtn);

    await waitFor(() => {
      const call = calls.find((c) => c.method === 'POST' && c.path === '/api/me/ledger/people');
      expect(call).toBeDefined();
      expect(call?.body).toEqual({ participantId: 'g-linh' });
    });
  });

  it('Typing "minh" shows existing Minh suggestion and no split-add-name button; typing "Hoa" shows split-add-name and tapping posts { name: "Hoa" }', async () => {
    const { calls } = mockApi({
      'GET /api/trips/t-led': directTripView(),
      'GET /api/me/people/candidates': candidates,
      'POST /api/me/ledger/people': () => Response.json({ participantId: 'led-h' }, { status: 201 }),
    });
    renderAt(<ExpenseForm />, directRoute);

    await screen.findByRole('heading', { level: 1, name: 'New expense' });

    await userEvent.click(screen.getByRole('button', { name: /^Split between/ }));

    const searchInput = screen.getByRole('textbox', { name: 'Add people' });

    await userEvent.type(searchInput, 'minh');
    expect(screen.getByRole('button', { name: 'Add Minh' })).toBeInTheDocument();
    expect(screen.queryByTestId('split-add-name')).toBeNull();

    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, 'Hoa');

    const addBtn = screen.getByTestId('split-add-name');
    expect(addBtn).toBeInTheDocument();
    expect(addBtn).toHaveTextContent('Add “Hoa” as someone new');

    await userEvent.click(addBtn);

    await waitFor(() => {
      const call = calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/ledger/people' && (c.body as Record<string, unknown>)?.name === 'Hoa',
      );
      expect(call).toBeDefined();
      expect(call?.body).toEqual({ name: 'Hoa', confirmNew: true });
    });
  });

  it('A group trip (preset "trip") still starts with everyone chosen and shows no candidates section', async () => {
    mockApi({
      'GET /api/trips/t-1': tripView({ trip: { ...tripView().trip, preset: 'trip' } }),
      'GET /api/me/people/candidates': candidates,
    });
    renderAt(<ExpenseForm />, groupRoute);

    await screen.findByRole('heading', { level: 1, name: 'Add expense' });

    expect(await screen.findByRole("button", { name: /^Split between/ })).toHaveAccessibleName(/Everyone/);

    await userEvent.click(screen.getByRole('button', { name: /^Split between/ }));

    const searchInput = screen.getByRole('textbox', { name: 'Add people' });
    await userEvent.type(searchInput, 'lin');

    expect(screen.queryByText('From your groups')).toBeNull();
    expect(document.querySelector('.fsl-split-sheet__groups')).toBeNull();
    expect(screen.queryByTestId('split-add-name')).toBeNull();
  });
});
