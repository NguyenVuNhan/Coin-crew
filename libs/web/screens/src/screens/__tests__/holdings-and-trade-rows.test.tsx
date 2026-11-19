import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  AssetView,
  EntryView,
  HoldingView,
  PersonalSummary,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { App } from '../../App';
import { AppNav } from '../../components/AppNav';

beforeEach(() => {
  localStorage.clear();
  setLang('vi');
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  setLang('en');
});

const meOn = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  personalArea: true,
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
};

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

const summary: PersonalSummary = {
  totalVnd: 10_000_000,
  approximate: false,
  perCurrency: [{ currency: 'VND', balance: 10_000_000 }],
  unratedWalletIds: [],
  month: '2026-11',
  spent: [],
  income: [],
};

const everydayWallet: WalletDetailView = {
  id: 'w-cash',
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
};

const investWallet: WalletDetailView = {
  id: 'w-inv',
  name: 'Ví đầu tư',
  currency: 'VND',
  balance: 8_000_000,
  isDefault: false,
  kind: 'investment',
  startAmount: 10_000_000,
  startDate: '2026-11-01',
  startCostVnd: null,
  vndValue: 8_000_000,
  icon: 'bg-avatar-2',
  sortOrder: 1,
  archived: false,
  entryCount: 1,
};

const investWallet2: WalletDetailView = {
  ...investWallet,
  id: 'w-inv-2',
  name: 'Ví chứng khoán',
  sortOrder: 2,
};

const archivedInvestWallet: WalletDetailView = {
  ...investWallet,
  id: 'w-inv-arch',
  name: 'Ví cũ',
  archived: true,
  sortOrder: 3,
};

const btcAsset: AssetView = {
  id: 'a-btc',
  name: 'BTC',
  unit: 'coin',
  groupName: 'Crypto',
  decimals: 8,
  hidden: false,
  sortOrder: 0,
  entryCount: 1,
};

const hiddenGoldAsset: AssetView = {
  id: 'a-gold',
  name: 'Vàng SJC',
  unit: 'chỉ',
  groupName: 'Vàng',
  decimals: 2,
  hidden: true,
  sortOrder: 1,
  entryCount: 1,
};

const btcHolding: HoldingView = {
  walletId: 'w-inv',
  assetId: 'a-btc',
  quantity: 50_000_000,
  cost: 500_000_000,
  costVnd: 500_000_000,
};

const buyEntry: EntryView = {
  id: 'e-buy-1',
  walletId: 'w-inv',
  type: 'buy',
  amount: 500_000_000,
  currency: 'VND',
  categoryId: null,
  assetId: 'a-btc',
  quantity: 50_000_000,
  transferId: null,
  counterpartWalletId: null,
  date: '2026-11-10',
  time: '10:00',
  note: null,
  tags: [],
  excludeFromReports: true,
  source: 'manual',
  beforeStart: false,
  createdAt: '2026-11-10T03:00:00.000Z',
};

const sellEntry: EntryView = {
  ...buyEntry,
  id: 'e-sell-1',
  type: 'sell',
  amount: 300_000_000,
  quantity: 25_000_000,
  assetId: 'a-btc',
};

function mockBase(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': { people: [], incomplete: false },
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/personal/summary': summary,
    'GET /api/me/personal/categories': { categories: [], recentIds: [] },
    'GET /api/me/personal/tags': { tags: [] },
    'GET /api/me/personal/wallets': { wallets: [everydayWallet, investWallet] },
    'GET /api/me/personal/assets': { assets: [btcAsset, hiddenGoldAsset] },
    'GET /api/me/personal/holdings': { holdings: [btcHolding] },
    'GET /api/me/personal/transactions': { rows: [], totals: [] },
    ...extra,
  });
}

describe('Task 9 — Holdings, trade rows, asset filter, and + menu', () => {
  it('investment wallet page lists holdings with quantity and cost; everyday wallet has no holdings section', async () => {
    mockBase();
    const first = renderAt(<App />, { route: '/wallets/w-inv' });

    const section = await screen.findByTestId('wallet-holdings');
    expect(within(section).getByText('Holdings')).toBeInTheDocument();
    expect(within(section).getByText('Cost basis, market price not included')).toBeInTheDocument();
    const list = await screen.findByTestId('wallet-holdings-list');
    expect(within(list).getByText('BTC')).toBeInTheDocument();
    expect(within(list).getByText(/0,5 coin/)).toBeInTheDocument();
    expect(within(list).getByText('500.000.000₫')).toBeInTheDocument();
    first.unmount();

    mockBase();
    renderAt(<App />, { route: '/wallets/w-cash' });
    await screen.findByTestId('wallet-summary');
    expect(screen.queryByTestId('wallet-holdings')).toBeNull();
  });

  it('investment wallet with no holdings shows empty state', async () => {
    mockBase({
      'GET /api/me/personal/holdings': { holdings: [] },
    });
    renderAt(<App />, { route: '/wallets/w-inv' });

    const section = await screen.findByTestId('wallet-holdings');
    expect(await within(section).findByText('No assets held yet')).toBeInTheDocument();
  });

  it('buy row reads "Mua BTC" with quantity and neutral ink; sell row reads "Bán BTC" with + in neutral ink', async () => {
    mockBase({
      'GET /api/me/personal/transactions': {
        rows: [
          { kind: 'entry', entry: buyEntry },
          { kind: 'entry', entry: sellEntry },
        ],
        totals: [],
      },
    });

    renderAt(<App />, { route: '/transactions?month=2026-11' });

    const buyRow = await screen.findByTestId('tx-row-e-buy-1');
    expect(within(buyRow).getByText('Buy BTC')).toBeInTheDocument();
    expect(within(buyRow).getByText('0,5 coin · Ví đầu tư')).toBeInTheDocument();
    const buyAmount = buyRow.querySelector('.fsl-tx-row__amount');
    expect(buyAmount).toHaveTextContent('−500.000.000₫');
    expect(buyAmount?.className).not.toContain('text-danger');
    expect(buyAmount?.className).not.toContain('text-success');

    const sellRow = await screen.findByTestId('tx-row-e-sell-1');
    expect(within(sellRow).getByText('Sell BTC')).toBeInTheDocument();
    expect(within(sellRow).getByText('0,25 coin · Ví đầu tư')).toBeInTheDocument();
    const sellAmount = sellRow.querySelector('.fsl-tx-row__amount');
    expect(sellAmount).toHaveTextContent('+300.000.000₫');
    expect(sellAmount?.className).not.toContain('text-danger');
    expect(sellAmount?.className).not.toContain('text-success');
  });

  it('detail page shows asset, quantity, and price per unit in wallet currency, and edit goes to edit route', async () => {
    const user = userEvent.setup();
    mockBase({
      'GET /api/me/personal/transactions': {
        rows: [{ kind: 'entry', entry: buyEntry }],
        totals: [],
      },
    });

    renderAt(<App />, { route: '/entries/e-buy-1' });

    expect(await screen.findByTestId('tx-detail-asset')).toHaveTextContent('BTC');
    expect(screen.getByTestId('tx-detail-quantity')).toHaveTextContent('0,5 coin');
    expect(screen.getByTestId('tx-detail-unit-price')).toHaveTextContent('1.000.000.000₫');
    expect(screen.getByText('Price per coin')).toBeInTheDocument();

    await user.click(screen.getByTestId('tx-detail-edit'));
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/entries/e-buy-1/edit');
    });
  });

  it('asset filter lists hidden assets, adds assetId to list query, shows removable pill, and supports type=trade', async () => {
    const user = userEvent.setup();
    const txUrls: string[] = [];
    mockBase({
      'GET /api/me/personal/transactions': (_init: RequestInit | undefined, url: string) => {
        txUrls.push(url);
        return { rows: [], totals: [] };
      },
    });

    renderAt(<App />, { route: '/transactions?month=2026-11' });

    await screen.findByTestId('tx-filter-btn');
    await user.click(screen.getByTestId('tx-filter-btn'));

    // Hidden asset is included in the asset pick list (#133: assets open from a row in the sheet)
    expect(await screen.findByTestId('tx-filter-type-trade')).toHaveTextContent('Buy / sell');
    await user.click(screen.getByTestId('tx-filter-type-trade'));
    await user.click(screen.getByTestId('tx-filter-row-asset'));
    const goldChip = await screen.findByTestId('tx-filter-asset-a-gold');
    expect(goldChip).toHaveTextContent('Vàng SJC');

    await user.click(goldChip);
    await user.click(screen.getByTestId('tx-filter-apply'));

    await waitFor(() => {
      expect(
        txUrls.some(
          (u) => u.includes('assetId=a-gold') && u.includes('type=trade'),
        ),
      ).toBe(true);
    });

    const assetPill = await screen.findByTestId('tx-filter-pill-assetId');
    expect(assetPill).toHaveTextContent('Vàng SJC');
    const typePill = screen.getByTestId('tx-filter-pill-type');
    expect(typePill).toHaveTextContent('Buy / sell');

    await user.click(assetPill);
    await waitFor(() => {
      expect(screen.queryByTestId('tx-filter-pill-assetId')).toBeNull();
    });
  });

  it('+ menu omits "Mua / bán tài sản" even when an active investment wallet exists', async () => {
    const user = userEvent.setup();

    mockBase({
      'GET /api/me/personal/wallets': {
        wallets: [everydayWallet, investWallet2, investWallet],
      },
    });
    renderAt(<AppNav section="home" addHref="/t/t-led/expenses/new" />, {
      route: '/trips',
    });
    await waitFor(() =>
      expect(screen.getAllByTestId('nav-add')[0]).toHaveAttribute('aria-haspopup', 'dialog'),
    );
    await user.click(screen.getAllByTestId('nav-add')[0]!);
    expect(await screen.findByTestId('add-menu-expense')).toBeInTheDocument();
    expect(screen.queryByTestId('add-menu-buy-sell')).toBeNull();
  });
});
