import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { tripView } from '../../test/fixtures';
import { Home } from '../Home';

afterEach(() => {
  vi.unstubAllGlobals();
});

const me = {
  user: {
    id: 'u-me',
    email: 'me@example.com',
    name: 'Me',
    consentAt: '2026-10-12T00:00:00.000Z',
  },
};

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
    {
      key: 'p:p-minh',
      name: 'Minh',
      nickname: null,
      userId: null,
      groupLabel: null,
      total: 270000,
      items: [],
      waiting: [],
    },
    {
      key: 'p:p-tuan',
      name: 'Tuấn',
      nickname: null,
      userId: null,
      groupLabel: 'Đà Lạt',
      total: -80000,
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
    payments: [
      {
        id: 'pay-1',
        fromId: 'p-minh',
        toId: 'p-me',
        amountClaimed: 120000,
        amountConfirmed: 120000,
        status: 'confirmed',
        notArrived: false,
        createdAt: '2026-10-31T08:00:00.000Z',
      },
    ],
  });
}

const mockDefaultApi = () =>
  mockApi({
    'GET /api/me': me,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
  });

describe('Home main screen (Khoản chi nhanh)', () => {
  it('shows the total card as the sum of the list', async () => {
    mockDefaultApi();
    renderAt(<Home />, { route: '/trips' });

    const totalCard = await screen.findByTestId('home-total');
    expect(totalCard).toHaveTextContent('620.000');
    expect(totalCard).toHaveTextContent('You owe 80.000₫');
  });

  it('lists people by person across groups', async () => {
    mockDefaultApi();
    renderAt(<Home />, { route: '/trips' });

    const linhRow = await screen.findByTestId('person-row-u:u-linh');
    const tuanRow = screen.getByTestId('person-row-p:p-tuan');
    expect(linhRow.compareDocumentPosition(tuanRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lists quick expenses and payments in tabs', async () => {
    mockDefaultApi();
    renderAt(<Home />, { route: '/trips' });

    expect(await screen.findByText('Taxi')).toBeInTheDocument();
    const paymentsTab = screen.getByRole('tab', { name: 'Payments' });
    await userEvent.click(paymentsTab);
    expect(await screen.findByTestId('payment-row-pay-1')).toBeInTheDocument();
  });

  it('opening an expense goes to its details', async () => {
    mockDefaultApi();
    renderAt(<Home />, { route: '/trips' });

    const taxiButton = await screen.findByRole('button', { name: /^Taxi/ });
    await userEvent.click(taxiButton);
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-led/expenses/e-taxi');
  });

  it('no New group button and the + adds a quick expense', async () => {
    mockDefaultApi();
    renderAt(<Home />, { route: '/trips' });

    await screen.findByTestId('home-total');
    expect(screen.queryByRole('link', { name: 'New group' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New group' })).toBeNull();

    const addLinks = await screen.findAllByTestId('nav-add');
    expect(addLinks.length).toBeGreaterThan(0);
    expect(addLinks[0]).toHaveAttribute('href', '/t/t-led/expenses/new');
  });

  it('from lg it sets a local selection and shows DetailsPanel in the right column', async () => {
    mockMedia({ wide: true });
    mockDefaultApi();
    renderAt(<Home />, { route: '/trips' });

    const taxiButton = await screen.findByRole('button', { name: /^Taxi/ });
    await userEvent.click(taxiButton);

    expect(await screen.findByRole('region', { name: 'Expense' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/trips');
  });
});
