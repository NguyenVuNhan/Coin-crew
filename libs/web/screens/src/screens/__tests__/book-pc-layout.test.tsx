import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoryView, EntryView, ListRow, TripView, WalletDetailView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
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

const peopleSummary = {
  people: [
    {
      key: 'u:u-linh',
      name: 'Linh',
      nickname: null,
      userId: 'u-linh',
      groupLabel: null,
      total: 350000,
      items: [],
      waiting: [],
    },
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

const wallets: WalletDetailView[] = [
  {
    id: 'w-cash',
    name: 'Tiền mặt',
    kind: 'everyday',
    currency: 'VND',
    balance: 2000000,
    startAmount: 2000000,
    startDate: '2026-11-01',
    startCostVnd: null,
    vndValue: 2000000,
    icon: 'bg-avatar-1',
    sortOrder: 0,
    archived: false,
    isDefault: true,
    entryCount: 10,
  },
];

const categories: CategoryView[] = [
  {
    id: 'cat-food',
    parentId: null,
    type: 'expense',
    name: 'Food',
    icon: 'receipt',
    hidden: false,
    sortOrder: 0,
  },
];

const makeEntryRow = (idx: number): ListRow => {
  const entry: EntryView = {
    id: `e-${idx}`,
    walletId: 'w-cash',
    type: 'expense',
    amount: 50000 + idx * 1000,
    currency: 'VND',
    categoryId: 'cat-food',
    transferId: null,
    counterpartWalletId: null,
    date: '2026-11-16',
    time: '09:00',
    note: `Item ${idx}`,
    tags: [],
    excludeFromReports: false,
    source: 'manual',
    beforeStart: false,
    createdAt: `2026-11-16T09:0${idx % 10}:00.000Z`,
  };
  return { kind: 'entry', entry };
};

const tenRows: ListRow[] = Array.from({ length: 10 }, (_, i) => makeEntryRow(i + 1));

function mockBookApp(me: unknown) {
  return mockApi({
    'GET /api/me': me,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/personal/wallets': { wallets },
    'GET /api/me/personal/summary': {
      totalVnd: 2000000,
      approximate: false,
      perCurrency: [{ currency: 'VND', balance: 2000000 }],
      unratedWalletIds: [],
      month: '2026-11',
      spent: [],
      income: [],
    },
    'GET /api/me/personal/transactions': { rows: tenRows, perCurrency: [] },
    'GET /api/me/personal/categories': { categories },
  });
}

describe('Spending book PC wide layout', () => {
  it('on wide screens with book on, puts book-total and book-recent (up to 8 rows) in main and only book-people-row in side', async () => {
    mockMedia({ wide: true });
    mockBookApp(meOn);
    renderAt(<App />, { route: '/trips' });

    const total = await screen.findByTestId('book-total');
    const recent = await screen.findByTestId('book-recent');
    const peopleRow = await screen.findByTestId('book-people-row');

    const mainCol = document.querySelector('.fsl-trip-layout__main') as HTMLElement;
    const sideCol = document.querySelector('.fsl-trip-layout__side') as HTMLElement;
    expect(mainCol).not.toBeNull();
    expect(sideCol).not.toBeNull();

    expect(mainCol).toContainElement(total);
    expect(mainCol).toContainElement(recent);
    expect(sideCol).toContainElement(peopleRow);
    // #114 Part 2 (owner-approved): with a wallet, the quick-expense lists give way to Giao dịch gần đây.
    expect(within(sideCol).queryByText('Taxi')).not.toBeInTheDocument();

    const rows = within(recent).getAllByTestId(/^tx-row-/);
    expect(rows).toHaveLength(8);
  });

  it('on wide screens with book on, the side column has no quick-expense list to open while total and recent stay in main', async () => {
    mockMedia({ wide: true });
    mockBookApp(meOn);
    renderAt(<App />, { route: '/trips' });

    await screen.findByTestId('book-total');
    await screen.findByTestId('book-people-row');
    const sideCol = document.querySelector('.fsl-trip-layout__side') as HTMLElement;
    // #114 Part 2 (owner-approved): quick expenses are opened from Giao dịch gần đây now, not from a side list.
    expect(within(sideCol).queryByRole('button', { name: /^Taxi/ })).not.toBeInTheDocument();
    expect(sideCol.querySelector('.fsl-expense-list')).toBeNull();
    const mainCol = document.querySelector('.fsl-trip-layout__main') as HTMLElement;
    expect(mainCol).toContainElement(screen.getByTestId('book-total'));
    expect(mainCol).toContainElement(screen.getByTestId('book-recent'));
  });

  it('on phones (<1024px), keeps total, people, recent order and 5 recent rows', async () => {
    mockMedia();
    mockBookApp(meOn);
    renderAt(<App />, { route: '/trips' });

    const total = await screen.findByTestId('book-total');
    const people = await screen.findByTestId('book-people-row');
    const recent = await screen.findByTestId('book-recent');

    expect(total.compareDocumentPosition(people) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(people.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const rows = within(recent).getAllByTestId(/^tx-row-/);
    expect(rows).toHaveLength(5);
  });

  it('on wide screens with book off, keeps the original Home layout (group lists in main, home-total in side)', async () => {
    mockMedia({ wide: true });
    mockBookApp(meOff);
    renderAt(<App />, { route: '/trips' });

    const homeTotal = await screen.findByTestId('home-total');
    const mainCol = document.querySelector('.fsl-trip-layout__main') as HTMLElement;
    const sideCol = document.querySelector('.fsl-trip-layout__side') as HTMLElement;

    expect(await within(mainCol).findByText('Taxi')).toBeInTheDocument();
    expect(sideCol).toContainElement(homeTotal);
    expect(screen.queryByTestId('book-total')).not.toBeInTheDocument();
  });
});
