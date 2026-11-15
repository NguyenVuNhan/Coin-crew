import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { TripView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { tripView } from '../../test/fixtures';
import { fakePlatform } from '../../test/fakePlatform';
import { App } from '../../App';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

// Same people and quick expenses as home-main.test.tsx, so both screens are judged on the same data.
const meOff = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
};
const meOn = { ...meOff, personalArea: true };
const signedOut = { user: null, signIn: { zalo: true }, mergeRequests: { incoming: [], outgoing: [] } };

const ledger = { tripId: 't-led', ownerPid: 'p-me' };

const person = (key: string, name: string, total: number, groupLabel: string | null = null) => ({
  key,
  name,
  nickname: null,
  userId: key.startsWith('u:') ? key.slice(2) : null,
  groupLabel,
  total,
  items: [],
  waiting: [],
});

const peopleSummary = {
  people: [
    person('u:u-linh', 'Linh', 350000),
    person('p:p-minh', 'Minh', 270000),
    person('p:p-tuan', 'Tuấn', -80000, 'Đà Lạt'),
  ],
  incomplete: false,
};

function ledgerView(): TripView {
  return tripView({
    trip: {
      id: 't-led',
      name: 'Quick expenses',
      currency: 'VND',
      fewestTransfers: true,
      archived: false,
      version: 1,
      total: 240000,
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

function mockApp(me: unknown | (() => unknown)) {
  return mockApi({
    'GET /api/me': typeof me === 'function' ? () => Response.json((me as () => unknown)()) : me,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
  });
}

/** Hands the test the app's query client, so it can make the app re-ask who is signed in. */
let client: QueryClient | null = null;
function GrabClient() {
  client = useQueryClient();
  return null;
}

const renderApp = (route: string, options: Omit<NonNullable<Parameters<typeof renderAt>[1]>, 'route'> = {}) =>
  renderAt(
    <>
      <App />
      <GrabClient />
    </>,
    { route, ...options },
  );

describe('Spending book (Sổ chi tiêu)', () => {
  describe('setting off', () => {
    it("/trips is today's Home and nothing new is on screen", async () => {
      mockApp(meOff);
      renderApp('/trips');

      expect(await screen.findByTestId('home-total')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Quick expenses' })).toBeInTheDocument();
      expect(screen.queryByTestId('book-empty')).not.toBeInTheDocument();
      expect(screen.queryByTestId('book-people-row')).not.toBeInTheDocument();
      expect(within(screen.getByTestId('app-nav-bar')).getByTestId('nav-home')).toHaveAccessibleName(
        'Quick expenses',
      );
    });

    it('/people goes back to the main screen', async () => {
      mockApp(meOff);
      renderApp('/people');

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/trips$/));
      expect(await screen.findByTestId('home-total')).toBeInTheDocument();
    });

    it('a stale hint on the phone is forgotten once the server says off', async () => {
      localStorage.setItem('personalArea', '1');
      mockApp(meOff);
      renderApp('/trips');

      expect(await screen.findByTestId('home-total')).toBeInTheDocument();
      expect(screen.queryByTestId('book-empty')).not.toBeInTheDocument();
      expect(localStorage.getItem('personalArea')).toBeNull();
    });
  });

  it('signed out: /people ends on the landing page', async () => {
    mockApp(signedOut);
    renderApp('/people');

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(screen.queryByTestId('book-empty')).not.toBeInTheDocument();
  });

  describe('setting on', () => {
    it('/trips is the spending book with its empty state and no button in it', async () => {
      mockApp(meOn);
      renderApp('/trips');

      const empty = await screen.findByTestId('book-empty');
      expect(empty).toHaveTextContent('Start with a wallet');
      expect(within(empty).queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Spending book' })).toBeInTheDocument();
      expect(screen.queryByTestId('home-total')).not.toBeInTheDocument();
      // Today's quick expenses are still there.
      expect(await screen.findByText('Taxi')).toBeInTheDocument();
    });

    it('the people row shows the total and opens the people page', async () => {
      mockApp(meOn);
      renderApp('/trips');

      const row = await screen.findByTestId('book-people-row');
      expect(row).toHaveAttribute('href', '/people');
      await waitFor(() => expect(row).toHaveTextContent('620.000')); // Linh 350.000 + Minh 270.000
      expect(row).toHaveTextContent('You owe 80.000₫');

      await userEvent.click(row);

      expect(await screen.findByRole('heading', { name: 'People' })).toBeInTheDocument();
      expect(await screen.findByTestId('person-row-u:u-linh')).toBeInTheDocument();
      expect(screen.getByTestId('person-row-p:p-tuan')).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/people$/);
    });

    it("on a phone, /trips?expense=<id> still opens that expense's own page", async () => {
      mockApp(meOn);
      renderApp('/trips?expense=e-taxi');

      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveTextContent('/t/t-led/expenses/e-taxi'),
      );
    });

    it('on a computer, the side panel names the spending book', async () => {
      mockMedia({ wide: true });
      mockApp(meOn);
      renderApp('/trips');

      await screen.findByTestId('book-empty');
      expect(within(screen.getByTestId('app-nav-side')).getByTestId('nav-home')).toHaveTextContent(
        'Spending book',
      );
      expect(await screen.findByTestId('book-people-row')).toBeInTheDocument();
    });

    it('in the Zalo Mini App, the same screen renders', async () => {
      mockApp(meOn);
      renderApp('/trips', { platform: fakePlatform({ kind: 'zmp' }) });

      expect(await screen.findByTestId('book-empty')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Spending book' })).toBeInTheDocument();
    });

    it('turned off while on /people: the page leaves for the main screen', async () => {
      let on = true;
      mockApp(() => (on ? meOn : meOff));
      renderApp('/people');
      await screen.findByRole('heading', { name: 'People' });

      on = false;
      await act(async () => {
        await client!.invalidateQueries({ queryKey: ['me'], exact: true });
      });

      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/trips$/));
      expect(await screen.findByTestId('home-total')).toBeInTheDocument();
    });
  });
});
