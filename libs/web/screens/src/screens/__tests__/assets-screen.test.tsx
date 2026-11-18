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

const meOff = {
  ...meOn,
  personalArea: false,
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
    id: 'a-vnm',
    name: 'Vinamilk',
    unit: 'cp',
    groupName: 'Cổ phiếu',
    decimals: 0,
    hidden: false,
    sortOrder: 2,
    entryCount: 1,
  },
  {
    id: 'a-old',
    name: 'Old Token',
    unit: 'OLD',
    groupName: 'Crypto',
    decimals: 6,
    hidden: true,
    sortOrder: 3,
    entryCount: 2,
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

describe('Personal settings: Assets', () => {
  it('gear menu shows Assets right after Categories and opens /personal/assets', async () => {
    const user = userEvent.setup();
    mockApp();
    renderAt(<App />, { route: '/trips' });

    const gearBtn = await screen.findByTestId('personal-settings-btn');
    await user.click(gearBtn);

    const categoriesBtn = await screen.findByRole('button', { name: 'Categories' });
    const assetsBtn = screen.getByRole('button', { name: 'Assets' });
    const tagsBtn = screen.getByRole('button', { name: 'Tags' });
    expect(
      categoriesBtn.compareDocumentPosition(assetsBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      assetsBtn.compareDocumentPosition(tagsBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(assetsBtn);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/personal\/assets$/));
  });

  it('adds BTC (coin, Crypto, 8) with exact POST body', async () => {
    const user = userEvent.setup();
    let currentAssets = [...starterAssets];
    const { calls } = mockApp({
      'GET /api/me/personal/assets': () => Response.json({ assets: currentAssets }),
      'POST /api/me/personal/assets': (init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const created: AssetView = {
          id: 'a-new',
          ...(body as Omit<AssetView, 'id' | 'hidden' | 'sortOrder' | 'entryCount'>),
          hidden: false,
          sortOrder: 4,
          entryCount: 0,
        };
        currentAssets = [...currentAssets, created];
        return Response.json({ asset: created }, { status: 201 });
      },
    });

    renderAt(<App />, { route: '/personal/assets' });
    await screen.findByText('Bitcoin');

    await user.click(screen.getByTestId('asset-add-btn'));
    await user.type(await screen.findByTestId('asset-name-input'), 'BTC');
    await user.type(screen.getByTestId('asset-unit-input'), 'coin');
    await user.click(screen.getByTestId('asset-group-chip-Crypto'));

    const plusBtn = screen.getByTestId('asset-decimals-plus');
    for (let i = 0; i < 8; i++) {
      await user.click(plusBtn);
    }
    expect(screen.getByTestId('asset-decimals-value')).toHaveTextContent('8');

    await user.click(screen.getByTestId('asset-save-btn'));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.path === '/api/me/personal/assets');
      expect(post?.body).toEqual({
        name: 'BTC',
        unit: 'coin',
        groupName: 'Crypto',
        decimals: 8,
      });
    });
  });

  it('renames an asset via PATCH and disables decimals stepper when used', async () => {
    const user = userEvent.setup();
    let currentAssets = [...starterAssets];
    const { calls } = mockApp({
      'GET /api/me/personal/assets': () => Response.json({ assets: currentAssets }),
      'PATCH /api/me/personal/assets/a-btc': (init?: RequestInit) => {
        const patch = (init?.body ? JSON.parse(String(init.body)) : {}) as Partial<AssetView>;
        currentAssets = currentAssets.map((a) => (a.id === 'a-btc' ? { ...a, ...patch } : a));
        return Response.json({ asset: currentAssets.find((a) => a.id === 'a-btc') });
      },
    });

    renderAt(<App />, { route: '/personal/assets' });
    const btcRow = await screen.findByTestId('asset-row-a-btc');
    await user.click(within(btcRow).getByRole('button', { name: 'Bitcoin' }));

    expect(await screen.findByTestId('asset-decimals-minus')).toBeDisabled();
    expect(screen.getByTestId('asset-decimals-plus')).toBeDisabled();
    expect(screen.getByTestId('asset-decimals-locked-reason')).toHaveTextContent(
      'Has transactions, cannot change',
    );

    const nameInput = screen.getByTestId('asset-name-input');
    await user.clear(nameInput);
    await user.type(nameInput, 'Bitcoin (BTC)');
    await user.click(screen.getByTestId('asset-save-btn'));

    await waitFor(() => {
      const patch = calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/personal/assets/a-btc',
      );
      expect(patch?.body).toEqual({
        name: 'Bitcoin (BTC)',
        unit: 'BTC',
        groupName: 'Crypto',
      });
    });
  });

  it('shows InlineError under name field on 422 duplicate name', async () => {
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
    await user.type(await screen.findByTestId('asset-name-input'), 'Bitcoin');
    await user.type(screen.getByTestId('asset-unit-input'), 'BTC');
    await user.click(screen.getByTestId('asset-save-btn'));

    expect(await screen.findByText('An asset with this name already exists')).toBeInTheDocument();
  });

  it('removing a used asset shows both choices, filters move targets by same decimals, and deletes with moveTo', async () => {
    const user = userEvent.setup();
    let currentAssets = [...starterAssets];
    let deletedUrl = '';
    mockApp({
      'GET /api/me/personal/assets': () => Response.json({ assets: currentAssets }),
      'DELETE /api/me/personal/assets/a-btc': (_init: RequestInit | undefined, url: string) => {
        deletedUrl = url;
        currentAssets = currentAssets.filter((a) => a.id !== 'a-btc');
        return Response.json({ ok: true });
      },
    });

    renderAt(<App />, { route: '/personal/assets' });
    const btcRow = await screen.findByTestId('asset-row-a-btc');
    await user.click(within(btcRow).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByTestId('asset-move-open')).toBeInTheDocument();
    expect(screen.getByTestId('asset-hide-instead')).toBeInTheDocument();

    await user.click(screen.getByTestId('asset-move-open'));
    expect(await screen.findByTestId('asset-move-target-a-eth')).toBeInTheDocument();
    expect(screen.queryByTestId('asset-move-target-a-vnm')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('asset-move-target-a-eth'));

    await waitFor(() => {
      expect(deletedUrl).toContain('/api/me/personal/assets/a-btc?moveTo=a-eth');
    });
  });

  it('removing a used asset can hide instead via PATCH hidden: true', async () => {
    const user = userEvent.setup();
    let currentAssets = [...starterAssets];
    const { calls } = mockApp({
      'GET /api/me/personal/assets': () => Response.json({ assets: currentAssets }),
      'PATCH /api/me/personal/assets/a-vnm': (init?: RequestInit) => {
        const patch = (init?.body ? JSON.parse(String(init.body)) : {}) as Partial<AssetView>;
        currentAssets = currentAssets.map((a) => (a.id === 'a-vnm' ? { ...a, ...patch } : a));
        return Response.json({ asset: currentAssets.find((a) => a.id === 'a-vnm') });
      },
    });

    renderAt(<App />, { route: '/personal/assets' });
    const vnmRow = await screen.findByTestId('asset-row-a-vnm');
    await user.click(within(vnmRow).getByRole('button', { name: 'Delete' }));

    await user.click(await screen.findByTestId('asset-move-open'));
    expect(await screen.findByTestId('asset-no-move-targets')).toBeInTheDocument();

    await user.click(screen.getByTestId('asset-hide-instead'));

    await waitFor(() => {
      const patch = calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/personal/assets/a-vnm',
      );
      expect(patch?.body).toEqual({ hidden: true });
    });
  });

  it('shows empty state with Add asset button and collapses hidden assets by default', async () => {
    const user = userEvent.setup();
    mockApp({
      'GET /api/me/personal/assets': { assets: [] },
    });

    renderAt(<App />, { route: '/personal/assets' });
    expect(await screen.findByText('No assets yet')).toBeInTheDocument();
    expect(screen.getByTestId('asset-add-btn')).toHaveTextContent('Add asset');

    mockApp();
    renderAt(<App />, { route: '/personal/assets' });
    const hiddenToggle = await screen.findByTestId('assets-hidden-toggle');
    expect(hiddenToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('assets-hidden-list')).not.toBeInTheDocument();

    await user.click(hiddenToggle);
    expect(hiddenToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('assets-hidden-list')).toBeInTheDocument();
    expect(screen.getByText('Old Token')).toBeInTheDocument();
  });

  it('hides menu item and redirects /personal/assets when personalArea switch is off', async () => {
    mockApp({
      'GET /api/me': meOff,
      'GET /api/trips': { trips: [] },
    });

    renderAt(<App />, { route: '/personal/assets' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/trips$/));
    expect(screen.queryByTestId('personal-settings-btn')).not.toBeInTheDocument();
  });
});
