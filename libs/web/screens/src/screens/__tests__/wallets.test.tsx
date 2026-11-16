import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PersonalSummary, TripView, WalletDetailView } from '@cc/core';
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

const meOff = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
};
const meOn = { ...meOff, personalArea: true };
const ledger = { tripId: 't-led', ownerPid: 'p-me' };

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

function makeWallet(overrides: Partial<WalletDetailView> = {}): WalletDetailView {
  return {
    id: 'w-1',
    name: 'Tiền mặt',
    currency: 'VND',
    balance: 2_000_000,
    isDefault: true,
    kind: 'everyday',
    startAmount: 2_000_000,
    startDate: '2026-11-01',
    startCostVnd: null,
    vndValue: 2_000_000,
    icon: 'bg-avatar-5',
    sortOrder: 0,
    archived: false,
    entryCount: 0,
    ...overrides,
  };
}

type Routes = Parameters<typeof mockApi>[0];

function mockApp(
  me: unknown,
  wallets: WalletDetailView[],
  summary: PersonalSummary,
  extra: Routes = {},
) {
  return mockApi({
    'GET /api/me': me,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': { people: [], incomplete: false },
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/personal/wallets': { wallets },
    'GET /api/me/personal/summary': summary,
    'GET /api/me/personal/transactions': { rows: [], totals: [] },
    ...extra,
  });
}

const renderApp = (route: string) => renderAt(<App />, { route });

describe('Wallets', () => {
  it('wallets page shows the ≈ VND total, one line per currency, everyday and investment groups, archived collapsed', async () => {
    const wallets: WalletDetailView[] = [
      makeWallet({ id: 'w-cash', name: 'Tiền mặt', currency: 'VND', balance: 1_500_000, vndValue: 1_500_000, kind: 'everyday', sortOrder: 0 }),
      makeWallet({ id: 'w-usd', name: 'USD Cash', currency: 'USD', balance: 10000, vndValue: 2_500_000, kind: 'investment', isDefault: false, sortOrder: 1 }),
      makeWallet({ id: 'w-old', name: 'Old Card', currency: 'VND', balance: 0, vndValue: 0, archived: true, isDefault: false, sortOrder: 2 }),
    ];
    const summary: PersonalSummary = {
      totalVnd: 4_000_000,
      approximate: true,
      perCurrency: [
        { currency: 'VND', balance: 1_500_000 },
        { currency: 'USD', balance: 10000 },
      ],
      unratedWalletIds: [],
      month: '2026-11',
      spent: [],
      income: [],
    };
    mockApp(meOn, wallets, summary);

    renderApp('/wallets');

    const total = await screen.findByTestId('wallets-total');
    await waitFor(() => expect(total).toHaveTextContent('≈ 4.000.000₫'));
    const perCurr = screen.getByTestId('wallets-per-currency');
    expect(perCurr).toHaveTextContent('1.500.000₫');
    expect(perCurr).toHaveTextContent('100,00 $');

    expect(screen.getByTestId('wallets-group-everyday')).toHaveTextContent('Tiền mặt');
    expect(screen.getByTestId('wallets-group-investment')).toHaveTextContent('USD Cash');

    const archivedToggle = screen.getByTestId('wallets-archived-toggle');
    expect(archivedToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('wallet-row-w-old')).not.toBeInTheDocument();

    await userEvent.click(archivedToggle);
    expect(archivedToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('wallet-row-w-old')).toBeInTheDocument();
  });

  it('a USDT wallet without a rate shows "chưa có tỷ giá" and stays out of the total', async () => {
    const wallets: WalletDetailView[] = [
      makeWallet({ id: 'w-cash', name: 'Tiền mặt', currency: 'VND', balance: 1_000_000, vndValue: 1_000_000 }),
      makeWallet({ id: 'w-usdt', name: 'Binance', currency: 'USDT', balance: 50000, vndValue: null, kind: 'investment', isDefault: false, sortOrder: 1 }),
    ];
    const summary: PersonalSummary = {
      totalVnd: 1_000_000,
      approximate: false,
      perCurrency: [
        { currency: 'VND', balance: 1_000_000 },
        { currency: 'USDT', balance: 50000 },
      ],
      unratedWalletIds: ['w-usdt'],
      month: '2026-11',
      spent: [],
      income: [],
    };
    mockApp(meOn, wallets, summary);

    renderApp('/wallets');

    expect(await screen.findByTestId('wallets-total')).toHaveTextContent('1.000.000₫');
    expect(screen.getByTestId('wallet-row-w-usdt')).toHaveTextContent('no rate yet');

    await userEvent.click(screen.getByTestId('wallet-row-w-usdt'));
    expect(await screen.findByTestId('wallet-cost-basis')).toHaveTextContent('no rate yet');
  });

  it('create a second wallet in USD with its VND value', async () => {
    const cash = makeWallet({ id: 'w-1', name: 'Tiền mặt', balance: 1_000_000, vndValue: 1_000_000 });
    const usd = makeWallet({
      id: 'w-2',
      name: 'Travel USD',
      currency: 'USD',
      balance: 20000,
      startAmount: 20000,
      startCostVnd: 5_000_000,
      vndValue: 5_000_000,
      isDefault: false,
      sortOrder: 1,
    });
    const list = [cash];
    const summary: PersonalSummary = {
      totalVnd: 1_000_000,
      approximate: false,
      perCurrency: [{ currency: 'VND', balance: 1_000_000 }],
      unratedWalletIds: [],
      month: '2026-11',
      spent: [],
      income: [],
    };
    const { calls } = mockApp(meOn, list, summary, {
      'GET /api/me/personal/wallets': () => Response.json({ wallets: list }),
      'POST /api/me/personal/wallets/add': () => {
        list.push(usd);
        return Response.json({ wallet: usd }, { status: 201 });
      },
    });

    renderApp('/wallets');

    await userEvent.click(await screen.findByTestId('wallets-add'));
    const form = await screen.findByTestId('wallet-form');
    await userEvent.type(within(form).getByTestId('wallet-form-name'), 'Travel USD');
    await userEvent.click(within(form).getByTestId('wallet-form-currency-USD'));
    await userEvent.type(within(form).getByTestId('wallet-form-amount'), '200');
    await userEvent.type(within(form).getByTestId('wallet-form-cost-vnd'), '5.000.000');
    await userEvent.click(within(form).getByTestId('wallet-form-submit'));

    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST' && c.path === '/api/me/personal/wallets/add')?.body).toMatchObject({
        name: 'Travel USD',
        currency: 'USD',
        startAmount: 20000,
        startCostVnd: 5_000_000,
      }),
    );
    expect(await screen.findByTestId('wallet-row-w-2')).toBeInTheDocument();
  });

  it('archive, restore, make default, reorder', async () => {
    const w1 = makeWallet({ id: 'w-1', name: 'Ví 1', isDefault: true, sortOrder: 0 });
    const w2 = makeWallet({ id: 'w-2', name: 'Ví 2', isDefault: false, sortOrder: 1 });
    let wallets = [w1, w2];
    const summary: PersonalSummary = {
      totalVnd: 4_000_000,
      approximate: false,
      perCurrency: [{ currency: 'VND', balance: 4_000_000 }],
      unratedWalletIds: [],
      month: '2026-11',
      spent: [],
      income: [],
    };
    const { calls } = mockApp(meOn, wallets, summary, {
      'GET /api/me/personal/wallets': () => Response.json({ wallets }),
      'POST /api/me/personal/wallets/reorder': () => {
        wallets = [
          { ...w2, sortOrder: 0 },
          { ...w1, sortOrder: 1 },
        ];
        return Response.json({ ok: true });
      },
      'PATCH /api/me/personal/wallets/w-2': (init: RequestInit | undefined) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        if (body.isDefault) {
          wallets = wallets.map((w) => ({ ...w, isDefault: w.id === 'w-2' }));
        }
        if (typeof body.archived === 'boolean') {
          wallets = wallets.map((w) => (w.id === 'w-2' ? { ...w, archived: body.archived as boolean } : w));
        }
        return Response.json({ wallet: wallets.find((w) => w.id === 'w-2') });
      },
    });

    renderApp('/wallets');

    // Reorder w-2 up
    await userEvent.click(await screen.findByTestId('wallets-reorder-toggle'));
    await userEvent.click(screen.getByTestId('wallet-move-up-w-2'));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'POST',
        path: '/api/me/personal/wallets/reorder',
        body: { ids: ['w-2', 'w-1'] },
      }),
    );
    await userEvent.click(screen.getByTestId('wallets-reorder-toggle'));

    // Open w-2 detail page: archive, restore, make default
    await userEvent.click(screen.getByTestId('wallet-row-w-2'));
    await screen.findByTestId('wallet-summary');

    // Archive
    await userEvent.click(screen.getByTestId('wallet-menu-btn'));
    await userEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PATCH',
        path: '/api/me/personal/wallets/w-2',
        body: { archived: true },
      }),
    );

    // Restore
    await userEvent.click(screen.getByTestId('wallet-menu-btn'));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PATCH',
        path: '/api/me/personal/wallets/w-2',
        body: { archived: false },
      }),
    );

    // Make default
    await userEvent.click(screen.getByTestId('wallet-menu-btn'));
    await userEvent.click(await screen.findByRole('button', { name: 'Make default' }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PATCH',
        path: '/api/me/personal/wallets/w-2',
        body: { isDefault: true },
      }),
    );
  });

  it('delete is offered only for an empty wallet', async () => {
    const used = makeWallet({ id: 'w-used', name: 'Used', entryCount: 2, isDefault: true });
    const empty = makeWallet({ id: 'w-empty', name: 'Empty', entryCount: 0, isDefault: false, sortOrder: 1 });
    let wallets = [used, empty];
    const summary: PersonalSummary = {
      totalVnd: 4_000_000,
      approximate: false,
      perCurrency: [{ currency: 'VND', balance: 4_000_000 }],
      unratedWalletIds: [],
      month: '2026-11',
      spent: [],
      income: [],
    };
    const { calls } = mockApp(meOn, wallets, summary, {
      'GET /api/me/personal/wallets': () => Response.json({ wallets }),
      'DELETE /api/me/personal/wallets/w-empty': () => {
        wallets = [used];
        return Response.json({ ok: true });
      },
    });

    // Used wallet: no Delete action
    const first = renderApp('/wallets/w-used');
    await userEvent.click(await screen.findByTestId('wallet-menu-btn'));
    expect(await screen.findByRole('button', { name: 'Edit wallet' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete wallet' })).not.toBeInTheDocument();
    first.unmount();

    // Empty wallet: Delete offered and confirms
    renderApp('/wallets/w-empty');
    await userEvent.click(await screen.findByTestId('wallet-menu-btn'));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete wallet' }));
    await userEvent.click(await screen.findByTestId('wallet-delete-confirm'));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'DELETE',
        path: '/api/me/personal/wallets/w-empty',
        body: undefined,
      }),
    );
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/wallets$/));
  });

  it('pie leaves out a negative wallet and groups the fifth as Khác', async () => {
    const wallets: WalletDetailView[] = [
      makeWallet({ id: 'w-1', name: 'W1', vndValue: 5_000_000, sortOrder: 0 }),
      makeWallet({ id: 'w-2', name: 'W2', vndValue: 4_000_000, isDefault: false, sortOrder: 1 }),
      makeWallet({ id: 'w-3', name: 'W3', vndValue: 3_000_000, isDefault: false, sortOrder: 2 }),
      makeWallet({ id: 'w-4', name: 'W4', vndValue: 2_000_000, isDefault: false, sortOrder: 3 }),
      makeWallet({ id: 'w-5', name: 'W5', vndValue: 1_000_000, isDefault: false, sortOrder: 4 }),
      makeWallet({ id: 'w-neg', name: 'DebtCard', balance: -500_000, vndValue: -500_000, isDefault: false, sortOrder: 5 }),
    ];
    const summary: PersonalSummary = {
      totalVnd: 14_500_000,
      approximate: false,
      perCurrency: [{ currency: 'VND', balance: 14_500_000 }],
      unratedWalletIds: [],
      month: '2026-11',
      spent: [],
      income: [],
    };
    mockApp(meOn, wallets, summary);

    renderApp('/trips');

    const pie = await screen.findByTestId('wallet-pie');
    expect(pie).toHaveTextContent('W1');
    expect(pie).toHaveTextContent('W4');
    expect(pie).toHaveTextContent('Other');
    expect(pie).not.toHaveTextContent('W5');
    expect(pie).not.toHaveTextContent('DebtCard');
    // No amounts in the pie widget
    expect(pie).not.toHaveTextContent('5.000.000');
    expect(screen.getByRole('img', { name: /W1, W2, W3, W4, Other/ })).toBeInTheDocument();
  });

  it('switch off: /wallets redirects and no wallet link renders', async () => {
    mockApp(meOff, [], {
      totalVnd: 0,
      approximate: false,
      perCurrency: [],
      unratedWalletIds: [],
      month: '2026-11',
      spent: [],
      income: [],
    });

    renderApp('/wallets');

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/trips$/));
    expect(await screen.findByTestId('home-total')).toBeInTheDocument();
    expect(screen.queryByTestId('book-wallets-link')).not.toBeInTheDocument();
  });

  it('first-wallet sheet sends non-VND, investment, or negative start to /wallets/add', async () => {
    const usdWallet = makeWallet({
      id: 'w-usd',
      name: 'USD Vault',
      currency: 'USD',
      kind: 'investment',
      balance: -10000,
      startAmount: -10000,
      startCostVnd: 2_500_000,
      vndValue: -2_500_000,
    });
    let wallets: WalletDetailView[] = [];
    const summary: PersonalSummary = {
      totalVnd: -2_500_000,
      approximate: true,
      perCurrency: [{ currency: 'USD', balance: -10000 }],
      unratedWalletIds: [],
      month: '2026-11',
      spent: [],
      income: [],
    };
    const { calls } = mockApp(meOn, wallets, summary, {
      'GET /api/me/personal/wallets': () => Response.json({ wallets }),
      'POST /api/me/personal/wallets/add': () => {
        wallets = [usdWallet];
        return Response.json({ wallet: usdWallet }, { status: 201 });
      },
    });

    renderApp('/trips');

    const form = await screen.findByTestId('first-wallet-form');
    await userEvent.click(within(form).getByTestId('first-wallet-kind-investment'));
    await userEvent.click(within(form).getByTestId('first-wallet-currency-USD'));
    await userEvent.click(within(form).getByTestId('first-wallet-negative'));
    await userEvent.type(within(form).getByTestId('first-wallet-amount'), '100');
    await userEvent.type(within(form).getByTestId('first-wallet-cost-vnd'), '2.500.000');
    await userEvent.click(within(form).getByTestId('first-wallet-create'));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'POST',
        path: '/api/me/personal/wallets/add',
        body: {
          name: 'Cash',
          startAmount: -10000,
          currency: 'USD',
          kind: 'investment',
          startCostVnd: 2_500_000,
        },
      }),
    );
  });
});
