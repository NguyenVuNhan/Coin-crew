import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { TripView, WalletView } from '@cc/core';
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

const cash: WalletView = { id: 'w-1', name: 'Tiền mặt', currency: 'VND', balance: 2320000, isDefault: true };

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

type Routes = Parameters<typeof mockApi>[0];

/** The app's API with one wallet already made, unless `routes` says otherwise. */
function mockApp(me: unknown | (() => unknown), routes: Routes = {}) {
  return mockApi({
    'GET /api/me': typeof me === 'function' ? () => Response.json((me as () => unknown)()) : me,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/personal/wallets': { wallets: [cash] },
    ...routes,
  });
}

const noWallet: Routes = { 'GET /api/me/personal/wallets': { wallets: [] } };

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
    it("/trips is today's Home and nothing new is on screen or asked of the server", async () => {
      const { calls } = mockApp(meOff);
      renderApp('/trips');

      expect(await screen.findByTestId('home-total')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Quick expenses' })).toBeInTheDocument();
      expect(screen.queryByTestId('book-empty')).not.toBeInTheDocument();
      expect(screen.queryByTestId('book-total')).not.toBeInTheDocument();
      expect(screen.queryByTestId('book-people-row')).not.toBeInTheDocument();
      expect(screen.queryByTestId('first-wallet-form')).not.toBeInTheDocument();
      expect(within(screen.getByTestId('app-nav-bar')).getByTestId('nav-home')).toHaveAccessibleName(
        'Quick expenses',
      );
      expect(calls.some((c) => c.path.startsWith('/api/me/personal'))).toBe(false);
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
      expect(screen.queryByTestId('book-total')).not.toBeInTheDocument();
      expect(localStorage.getItem('personalArea')).toBeNull();
    });
  });

  it('signed out: /people ends on the landing page', async () => {
    mockApp(signedOut);
    renderApp('/people');

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(screen.queryByTestId('book-total')).not.toBeInTheDocument();
  });

  describe('setting on, with a wallet', () => {
    it('/trips is the spending book: the total, the wallet, and no popup', async () => {
      mockApp(meOn);
      renderApp('/trips');

      const total = await screen.findByTestId('book-total');
      expect(total).toHaveTextContent('Total');
      expect(total).toHaveTextContent('2.320.000₫');
      expect(total).toHaveTextContent('Tiền mặt');
      // The total is what you have, not what someone owes: it is not in a money colour.
      expect(total.querySelector('.fsl-amount')).not.toHaveClass('text-success');
      expect(screen.getByRole('heading', { name: 'Spending book' })).toBeInTheDocument();
      expect(screen.queryByTestId('book-empty')).not.toBeInTheDocument();
      expect(screen.queryByTestId('first-wallet-form')).not.toBeInTheDocument();
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
      // Read out with each amount next to its label.
      expect(row).toHaveAccessibleName('People owe you: 620.000₫. You owe 80.000₫');
      expect(row.querySelector('.fsl-amount')).toHaveClass('text-success');

      await userEvent.click(row);

      expect(await screen.findByRole('heading', { name: 'People' })).toBeInTheDocument();
      expect(await screen.findByTestId('person-row-u:u-linh')).toBeInTheDocument();
      expect(screen.getByTestId('person-row-p:p-tuan')).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/people$/);
    });

    it('with nobody owing, the zero is not in a money colour', async () => {
      mockApp(meOn, { 'GET /api/me/people/summary': { people: [], incomplete: false } });
      renderApp('/trips');

      const row = await screen.findByTestId('book-people-row');
      expect(row).toHaveAccessibleName('People owe you: 0₫');
      expect(row.querySelector('.fsl-amount')).not.toHaveClass('text-success');
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

      await screen.findByTestId('book-total');
      expect(within(screen.getByTestId('app-nav-side')).getByTestId('nav-home')).toHaveTextContent(
        'Spending book',
      );
      expect(await screen.findByTestId('book-people-row')).toBeInTheDocument();
    });

    it('in the Zalo Mini App, the same screen renders', async () => {
      mockApp(meOn);
      renderApp('/trips', { platform: fakePlatform({ kind: 'zmp' }) });

      expect(await screen.findByTestId('book-total')).toBeInTheDocument();
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

    it('a wallet list that fails to load says so and still shows the rest', async () => {
      mockApp(meOn, {
        'GET /api/me/personal/wallets': () =>
          Response.json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } }, { status: 500 }),
      });
      renderApp('/trips');

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.queryByTestId('first-wallet-form')).not.toBeInTheDocument();
      expect(await screen.findByTestId('book-people-row')).toBeInTheDocument();
    });
  });

  describe('setting on, no wallet yet', () => {
    it('the popup opens by itself and creating the wallet shows the total', async () => {
      const { calls } = mockApp(meOn, {
        ...noWallet,
        'POST /api/me/personal/wallets': () => Response.json({ wallet: cash }, { status: 201 }),
      });
      renderApp('/trips');

      const form = await screen.findByTestId('first-wallet-form');
      expect(screen.getByRole('dialog', { name: 'Your first wallet' })).toBeInTheDocument();
      const name = within(form).getByLabelText('Wallet name');
      expect(name).toHaveValue('Cash');
      const amount = within(form).getByLabelText('How much do you have now?');

      await userEvent.clear(name);
      await userEvent.type(name, '  Tiền mặt ');
      await userEvent.type(amount, '2.320.000');
      expect(form).toHaveTextContent('2.320.000₫');
      await userEvent.click(within(form).getByTestId('first-wallet-create'));

      await waitFor(() =>
        expect(calls).toContainEqual({
          method: 'POST',
          path: '/api/me/personal/wallets',
          body: { name: 'Tiền mặt', startAmount: 2320000 },
        }),
      );
      await waitFor(() => expect(screen.queryByTestId('first-wallet-form')).not.toBeInTheDocument());
      expect(await screen.findByTestId('book-total')).toHaveTextContent('2.320.000₫');
      expect(screen.queryByTestId('book-empty')).not.toBeInTheDocument();
    });

    it('an empty amount means zero', async () => {
      const { calls } = mockApp(meOn, {
        ...noWallet,
        'POST /api/me/personal/wallets': () =>
          Response.json({ wallet: { ...cash, name: 'Cash', balance: 0 } }, { status: 201 }),
      });
      renderApp('/trips');

      const form = await screen.findByTestId('first-wallet-form');
      await userEvent.click(within(form).getByTestId('first-wallet-create'));

      await waitFor(() =>
        expect(calls).toContainEqual({
          method: 'POST',
          path: '/api/me/personal/wallets',
          body: { name: 'Cash', startAmount: 0 },
        }),
      );
      expect(await screen.findByTestId('book-total')).toHaveTextContent('0₫');
    });

    it('an amount that is not a number, or no name, cannot be sent', async () => {
      const { calls } = mockApp(meOn, noWallet);
      renderApp('/trips');

      const form = await screen.findByTestId('first-wallet-form');
      const create = within(form).getByTestId('first-wallet-create');
      await userEvent.type(within(form).getByLabelText('How much do you have now?'), 'abc');
      expect(within(form).getByRole('alert')).toHaveTextContent('Enter an amount like');
      expect(create).toBeDisabled();

      await userEvent.clear(within(form).getByLabelText('How much do you have now?'));
      expect(create).toBeEnabled();
      await userEvent.clear(within(form).getByLabelText('Wallet name'));
      expect(create).toBeDisabled();
      expect(calls.some((c) => c.method === 'POST')).toBe(false);
    });

    it('closing the popup leaves the empty state, whose button opens it again', async () => {
      mockApp(meOn, noWallet);
      renderApp('/trips');

      await screen.findByTestId('first-wallet-form');
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByTestId('first-wallet-form')).not.toBeInTheDocument());

      const empty = screen.getByTestId('book-empty');
      expect(empty).toHaveTextContent('Start with a wallet');
      // It does not come back by itself while the person stays on the screen.
      expect(screen.queryByTestId('first-wallet-form')).not.toBeInTheDocument();
      // What the person already has is still there.
      expect(await screen.findByTestId('book-people-row')).toBeInTheDocument();
      expect(await screen.findByText('Taxi')).toBeInTheDocument();

      await userEvent.click(within(empty).getByRole('button', { name: 'Create your first wallet' }));
      expect(await screen.findByTestId('first-wallet-form')).toBeInTheDocument();
    });

    it('a create the server refuses says so and keeps what was typed', async () => {
      mockApp(meOn, {
        ...noWallet,
        'POST /api/me/personal/wallets': () =>
          Response.json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } }, { status: 500 }),
      });
      renderApp('/trips');

      const form = await screen.findByTestId('first-wallet-form');
      await userEvent.type(within(form).getByLabelText('How much do you have now?'), '500k');
      await userEvent.click(within(form).getByTestId('first-wallet-create'));

      expect(await within(form).findByRole('alert')).toBeInTheDocument();
      expect(within(form).getByLabelText('How much do you have now?')).toHaveValue('500k');
      expect(screen.queryByTestId('book-total')).not.toBeInTheDocument();
    });
  });
});
