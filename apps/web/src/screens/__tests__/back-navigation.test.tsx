import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MyActivityItem, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { tripView } from '../../test/fixtures';
import { App } from '../../App';

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderApp(initialEntry: string) {
  return renderAt(<App />, { route: initialEntry, path: '*' });
}

const meUser = {
  user: {
    id: 'u-me',
    email: 'me@example.com',
    name: 'Me',
    consentAt: '2026-10-12T00:00:00.000Z',
    providers: ['google'],
  },
  signIn: { zalo: false },
  mergeRequests: { incoming: [], outgoing: [] },
};

function ledgerView(): TripView {
  return tripView({
    trip: {
      id: 't-led',
      name: 'Me',
      currency: 'VND',
      fewestTransfers: true,
      archived: false,
      version: 1,
      total: 240000,
      preset: 'direct',
    },
    me: { kind: 'member', participantId: 'p-me', participantPending: false, isOrganiser: true },
    people: [
      { id: 'p-me', name: 'Me', status: 'active', isMember: true, bank: 'approved' },
      { id: 'p-minh', name: 'Minh', status: 'active', isMember: false, bank: 'none' },
    ],
    expenses: [
      {
        id: 'e-taxi',
        description: 'Taxi',
        amount: 240000,
        spentOn: '2026-10-30',
        payerId: 'p-me',
        mode: 'equal',
        status: 'approved',
        rejectReason: null,
        disabledByName: null,
        createdById: 'p-me',
        shares: [
          { participantId: 'p-me', amount: 120000, inputValue: 1 },
          { participantId: 'p-minh', amount: 120000, inputValue: 1 },
        ],
      },
    ],
    payments: [],
  });
}

const groupActivityItem: MyActivityItem = {
  id: 'a-1',
  tripId: 't-1',
  tripName: 'Đà Lạt · Oct 2026',
  kind: 'group',
  action: 'expense_added',
  actorName: 'Me',
  deviceShort: null,
  details: {
    description: 'Homestay Bloom',
    amount: 3200000,
    expenseId: 'e-1',
  },
  createdAt: '2026-10-31T10:00:00.000Z',
  names: {},
};

const ledgerActivityItem: MyActivityItem = {
  id: 'a-2',
  tripId: 't-led',
  tripName: 'Quick expenses',
  kind: 'direct',
  action: 'expense_added',
  actorName: 'Me',
  deviceShort: null,
  details: {
    description: 'Taxi',
    amount: 240000,
    expenseId: 'e-taxi',
  },
  createdAt: '2026-10-31T09:00:00.000Z',
  names: {},
};

const api = () =>
  mockApi({
    'GET /api/me': meUser,
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
    'GET /api/me/people/summary': { people: [], incomplete: false },
    'GET /api/trips': [
      { id: 't-1', name: 'Đà Lạt · Oct 2026', archived: false, myBalance: 500000 },
    ],
    'GET /api/trips/t-1': tripView(),
    'GET /api/trips/t-1/version': { version: 1 },
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/activity': { items: [groupActivityItem, ledgerActivityItem], next: null },
  });

describe('back-navigation', () => {
  it('row 3: Activity → group expense → Back returns to Activity', async () => {
    mockMedia({ wide: false });
    api();
    renderApp('/activity');

    const item = await screen.findByRole('link', { name: /Homestay Bloom/ });
    await userEvent.click(item);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Expense' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/activity'));
  });

  it('row 4: wide, Activity → group expense → panel × returns to Activity', async () => {
    mockMedia({ wide: true });
    api();
    renderApp('/activity');

    const item = await screen.findByRole('link', { name: /Homestay Bloom/ });
    await userEvent.click(item);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-1'));
    const panel = await screen.findByRole('region', { name: 'Expense' });
    expect(panel).toBeInTheDocument();

    const closeBtn = within(panel).getByRole('button', { name: 'Close' });
    await userEvent.click(closeBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/activity'));
  });

  it('row 5: Activity → ledger expense on a phone → Back returns to Activity', async () => {
    mockMedia({ wide: false });
    api();
    renderApp('/activity');

    const item = await screen.findByRole('link', { name: /Taxi/ });
    await userEvent.click(item);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-led/expenses/e-taxi'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Expense' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/activity'));
  });

  it("expense form opened from Activity's + returns to Activity on Back", async () => {
    mockMedia({ wide: false });
    api();
    renderApp('/activity');

    const bar = await screen.findByTestId('app-nav-bar');
    const addBtn = within(bar).getByTestId('nav-add');
    await userEvent.click(addBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-led/expenses/new'));
    expect(await screen.findByRole('heading', { level: 1, name: 'New expense' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/activity'));
  });

  it("wide: with the panel open, the group's header Back closes the panel first", async () => {
    mockMedia({ wide: true });
    api();
    renderApp('/groups');

    const groupLink = await screen.findByRole('link', { name: /Đà Lạt/ });
    await userEvent.click(groupLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();

    const row = await screen.findByRole('button', { name: /^Homestay Bloom/ });
    await userEvent.click(row);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-1'));
    expect(await screen.findByRole('region', { name: 'Expense' })).toBeInTheDocument();

    const headerBack = screen.getByRole('link', { name: 'Back' });
    await userEvent.click(headerBack);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(screen.queryByRole('region', { name: 'Expense' })).toBeNull();

    await userEvent.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/groups$/));
  });
});
