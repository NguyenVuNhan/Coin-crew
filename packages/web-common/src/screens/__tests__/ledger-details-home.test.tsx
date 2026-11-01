import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import type { MyActivityItem, TripView } from '@fsl/core';
import { mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { tripView } from '../../test/fixtures';
import { setLang } from '../../i18n';
import { App } from '../../App';

afterEach(() => {
  vi.unstubAllGlobals();
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderApp(initialEntries: string[]) {
  setLang('en');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The main screen's nav entry is current (the ledger shown as a group would have Groups current). */
const onHome = () => within(screen.getByTestId('app-nav-side')).getByTestId('nav-home').getAttribute('aria-current') === 'page';

const me = { user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' } };

function ledgerView(): TripView {
  return tripView({
    trip: { id: 't-led', name: 'Me', currency: 'VND', fewestTransfers: true, archived: false, version: 1, total: 240000, preset: 'direct' },
    me: { kind: 'member', participantId: 'p-me', participantPending: false, isOrganiser: true },
    people: [
      { id: 'p-me', name: 'Me', status: 'active', isMember: true, bank: 'approved' },
      { id: 'p-minh', name: 'Minh', status: 'active', isMember: false, bank: 'none' },
    ],
    expenses: [
      {
        id: 'e-taxi', description: 'Taxi', amount: 240000, spentOn: '2026-10-30', payerId: 'p-me', mode: 'equal', status: 'approved',
        rejectReason: null, disabledByName: null, createdById: 'p-me',
        shares: [
          { participantId: 'p-me', amount: 120000, inputValue: 1 },
          { participantId: 'p-minh', amount: 120000, inputValue: 1 },
        ],
      },
    ],
    payments: [
      { id: 'pay-1', fromId: 'p-minh', toId: 'p-me', amountClaimed: 120000, amountConfirmed: 120000, status: 'confirmed', notArrived: false, createdAt: '2026-10-31T08:00:00.000Z' },
    ],
  });
}

const activityItem: MyActivityItem = {
  id: 'a-1', action: 'expense_added', actorName: 'Me', deviceShort: null, createdAt: '2026-10-31T08:00:00.000Z',
  details: { expenseId: 'e-taxi', description: 'Taxi', amount: 240000 },
  tripId: 't-led', tripName: 'Me', kind: 'direct', names: {},
} as unknown as MyActivityItem;

const api = () =>
  mockApi({
    'GET /api/me': me,
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
    'GET /api/me/people/summary': { people: [], incomplete: false },
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/activity': { items: [activityItem], next: null },
  });

describe('ledger item details open on the main screen', () => {
  it('from lg, a ledger expense address shows /trips with the expense open in the right column', async () => {
    mockMedia({ wide: true });
    api();
    renderApp(['/t/t-led/expenses/e-taxi']);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/trips?expense=e-taxi'));
    const panel = await screen.findByRole('region', { name: 'Expense' });
    expect(within(panel).getAllByText('Taxi').length).toBeGreaterThan(0);
    // The main screen, not the ledger as a group page.
    expect(onHome()).toBe(true);
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
  });

  it('from lg, a ledger payment address opens it on the main screen', async () => {
    mockMedia({ wide: true });
    api();
    renderApp(['/t/t-led/payments/pay-1']);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/trips?payment=pay-1'));
    expect(await screen.findByRole('region', { name: 'Payment' })).toBeInTheDocument();
  });

  it("from lg, × clears the main screen's selection in place", async () => {
    mockMedia({ wide: true });
    api();
    renderApp(['/trips']);
    await userEvent.click(await screen.findByRole('button', { name: /^Taxi/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/trips?expense=e-taxi');
    const panel = await screen.findByRole('region', { name: 'Expense' });
    await userEvent.click(within(panel).getAllByRole('button', { name: 'Close' })[0]!);
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/trips$/);
    expect(screen.queryByRole('region', { name: 'Expense' })).toBeNull();
    expect(screen.getByTestId('home-total')).toBeInTheDocument();
  });

  it('from lg, a quick-expense line in Activity opens on the main screen', async () => {
    mockMedia({ wide: true });
    api();
    renderApp(['/activity']);
    const line = await screen.findByRole('link', { name: /Taxi/ });
    expect(line).toHaveAttribute('href', '/trips?expense=e-taxi');
    await userEvent.click(line);
    expect(await screen.findByRole('region', { name: 'Expense' })).toBeInTheDocument();
    expect(onHome()).toBe(true);
  });

  it('on a phone, a ledger expense address is the details page, and back goes to /trips', async () => {
    api();
    renderApp(['/t/t-led/expenses/e-taxi']);
    const back = await screen.findByRole('button', { name: 'Back' });
    expect(screen.getByRole('heading', { name: 'Expense' })).toBeInTheDocument();
    await userEvent.click(back);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/trips$/));
    expect(await screen.findByTestId('home-total')).toBeInTheDocument();
  });

  it('on a phone, /trips?expense= shows the details page', async () => {
    api();
    renderApp(['/trips?expense=e-taxi']);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-led/expenses/e-taxi'));
    expect(await screen.findByRole('heading', { name: 'Expense' })).toBeInTheDocument();
  });
});
