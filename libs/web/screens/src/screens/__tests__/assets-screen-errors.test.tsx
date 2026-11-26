import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AssetView, TripView, WalletView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { App } from '../../App';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const meOn = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: true,
};

const ledger = { tripId: 't-led', ownerPid: 'p-me' };
const cash: WalletView = { id: 'w-1', name: 'Tiền mặt', currency: 'VND', balance: 2320000, isDefault: true };

const starterAssets: AssetView[] = [
  {
    id: 'a-btc',
    name: 'Bitcoin',
    unit: 'BTC',
    groupName: 'Crypto',
    decimals: 8,
    hidden: false,
    sortOrder: 0,
    entryCount: 3,
  },
  {
    id: 'a-eth',
    name: 'Ethereum',
    unit: 'ETH',
    groupName: 'Crypto',
    decimals: 8,
    hidden: false,
    sortOrder: 1,
    entryCount: 0,
  },
  {
    id: 'a-old-btc',
    name: 'Wrapped BTC',
    unit: 'WBTC',
    groupName: 'Crypto',
    decimals: 8,
    hidden: true,
    sortOrder: 2,
    entryCount: 1,
  },
];

function ledgerView(): TripView {
  return tripView({
    trip: {
      id: 't-led',
      name: 'Quick expenses',
      currency: 'VND',
      fewestTransfers: true,
      archived: false,
      version: 1,
      total: 0,
    },
    me: { kind: 'member', participantId: 'p-me', participantPending: false, isOrganiser: true },
    people: [{ id: 'p-me', name: 'Me', status: 'active', isMember: true, bank: 'approved' }],
    expenses: [],
    payments: [],
  });
}

type Routes = Parameters<typeof mockApi>[0];

function mockApp(routes: Routes = {}) {
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': { people: [], incomplete: false },
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/personal/wallets': { wallets: [cash] },
    'GET /api/me/personal/summary': { month: '2026-11', totalVnd: 2320000, approximate: false, spent: [], income: [] },
    'GET /api/me/personal/transactions': { rows: [], hasMore: false },
    'GET /api/me/personal/assets': { assets: starterAssets },
    ...routes,
  });
}

describe('Personal settings: Assets error handling & move targets', () => {
  it('shows an error inside the in-use sheet when move-to DELETE fails with 500, and keeps the sheet open', async () => {
    const user = userEvent.setup();
    mockApp({
      'DELETE /api/me/personal/assets/a-btc': () =>
        Response.json({ error: { code: 'INTERNAL', message: 'Boom' } }, { status: 500 }),
    });

    renderAt(<App />, { route: '/personal/assets' });
    const btcRow = await screen.findByTestId('asset-row-a-btc');
    await user.click(within(btcRow).getByRole('button', { name: 'Delete' }));

    await user.click(await screen.findByTestId('asset-move-open'));
    await user.click(await screen.findByTestId('asset-move-target-a-eth'));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('asset-move-list')).toBeInTheDocument();
  });

  it('shows an error when the hide switch PATCH fails', async () => {
    const user = userEvent.setup();
    mockApp({
      'PATCH /api/me/personal/assets/a-eth': () =>
        Response.json({ error: { code: 'INTERNAL', message: 'Boom' } }, { status: 500 }),
    });

    renderAt(<App />, { route: '/personal/assets' });
    const ethRow = await screen.findByTestId('asset-row-a-eth');
    await user.click(within(ethRow).getByTestId('asset-toggle-hidden-a-eth'));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('clears the duplicate-name 422 error completely after typing in the name field', async () => {
    const user = userEvent.setup();
    mockApp({
      'POST /api/me/personal/assets': () =>
        Response.json(
          { error: { code: 'VALIDATION', message: 'Duplicate', details: { field: 'name' } } },
          { status: 422 },
        ),
    });

    renderAt(<App />, { route: '/personal/assets' });
    await screen.findByText('Bitcoin');

    await user.click(screen.getByTestId('asset-add-btn'));
    const nameInput = await screen.findByTestId('asset-name-input');
    await user.type(nameInput, 'Bitcoin');
    await user.type(screen.getByTestId('asset-unit-input'), 'BTC');
    await user.click(screen.getByTestId('asset-save-btn'));

    expect(await screen.findByText('An asset with this name already exists')).toBeInTheDocument();

    await user.type(nameInput, '2');

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('does not offer a hidden asset with the same decimals as a move target', async () => {
    const user = userEvent.setup();
    mockApp();

    renderAt(<App />, { route: '/personal/assets' });
    const btcRow = await screen.findByTestId('asset-row-a-btc');
    await user.click(within(btcRow).getByRole('button', { name: 'Delete' }));

    await user.click(await screen.findByTestId('asset-move-open'));

    expect(await screen.findByTestId('asset-move-target-a-eth')).toBeInTheDocument();
    expect(screen.queryByTestId('asset-move-target-a-old-btc')).not.toBeInTheDocument();
  });
});
