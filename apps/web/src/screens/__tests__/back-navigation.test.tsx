import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MyActivityItem, PersonSummary, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { tripView, guestChiView, PIDS } from '../../test/fixtures';
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

describe('screens with one hard-coded back', () => {
  it('row 1: person → group → Back returns to the person', async () => {
    mockMedia({ wide: false });
    const tuan: PersonSummary = {
      key: 'p:p-tuan',
      name: 'Tuấn',
      nickname: null,
      userId: null,
      groupLabel: 'Đà Lạt · Oct 2026',
      total: -80000,
      items: [
        {
          tripId: 't-1',
          tripName: 'Đà Lạt · Oct 2026',
          kind: 'group',
          amount: -80000,
          otherPid: PIDS.M,
          ownerPid: 'p-me',
          oldestOpenAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      waiting: [],
      linked: [],
    };
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { incomplete: false, people: [tuan] },
      'GET /api/trips/t-1': tripView(),
      'GET /api/trips/t-1/version': { version: 1 },
    });
    renderApp('/people/p%3Ap-tuan');

    const groupLink = await screen.findByTestId('person-item-t-1');
    await userEvent.click(groupLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();

    const backLink = screen.getByRole('link', { name: 'Back' });
    await userEvent.click(backLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/people/p%3Ap-tuan'));
  });

  it('row 7: group BalanceCard → /me/bank → Back returns to the group', async () => {
    mockMedia({ wide: false });
    const view = tripView({
      people: tripView().people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'none' } : p)),
    });
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips/t-1': view,
      'GET /api/trips/t-1/version': { version: 1 },
      'GET /api/me/bank': null,
    });
    renderApp('/t/t-1');

    const bankPromptLink = await screen.findByRole('link', { name: 'Your bank details' });
    await userEvent.click(bankPromptLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/me/bank'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Your bank details' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1'));
  });

  it('row 8: Groups → account menu → /me/bank → Back returns to Groups', async () => {
    mockMedia({ wide: false });
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips': [
        { id: 't-1', name: 'Đà Lạt · Oct 2026', archived: false, myBalance: 500000 },
      ],
      'GET /api/me/bank': null,
    });
    renderApp('/groups');

    expect(await screen.findByRole('heading', { level: 1, name: 'Groups' })).toBeInTheDocument();

    const accountBtn = screen.getByRole('button', { name: 'Account' });
    await userEvent.click(accountBtn);

    const menu = await screen.findByRole('dialog', { name: 'Account' });
    const bankLink = within(menu).getByRole('link', { name: 'Your bank details' });
    await userEvent.click(bankLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/me/bank'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Your bank details' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/groups'));
  });

  it('row 9: group → privacy → Back returns to the group', async () => {
    mockMedia({ wide: false });
    api();
    renderApp('/t/t-1');

    await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' });

    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    const menu = await screen.findByRole('dialog', { name: 'Account' });
    await userEvent.click(within(menu).getByRole('link', { name: 'Privacy notice' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/privacy'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy notice' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1'));
  });

  it('row 9: guest under /j/<token> → privacy → Back returns to the group', async () => {
    mockMedia({ wide: false });
    mockApi({
      'GET /api/me': { user: null },
      'GET /api/links/tok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' },
      'GET /api/trips/t-1': guestChiView(),
      'GET /api/trips/t-1/version': { version: 3 },
      'GET /api/me/bank': null,
    });
    renderApp('/j/tok-1');

    expect(await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();

    const addBank = await screen.findByRole('link', { name: 'Add' });
    await userEvent.click(addBank);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/j/tok-1/bank'));
    const privacyLink = await screen.findByRole('link', { name: 'privacy notice' });
    await userEvent.click(privacyLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/privacy'));
    await userEvent.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/j/tok-1/bank'));
    await userEvent.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/j/tok-1'));
  });

  it('row 10: group transfers → guest bank → Back returns to the group', async () => {
    mockMedia({ wide: false });
    const view = tripView({
      suggestions: [{ fromId: PIDS.M, toId: PIDS.C, amount: 500000 }],
    });
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips/t-1': view,
      'GET /api/trips/t-1/version': { version: 1 },
      [`GET /api/trips/t-1/pay/${PIDS.C}`]: {
        to: { id: PIDS.C, name: 'Chi' },
        amount: 500000,
        bankState: 'none',
        payload: null,
        inFlight: [],
      },
    });
    renderApp('/t/t-1');

    const transferRow = await screen.findByTestId(`transfer-${PIDS.M}-${PIDS.C}`);
    await userEvent.click(within(transferRow).getByRole('button', { name: /Chi/ }));

    const addBankBtn = await screen.findByRole('link', { name: 'Add bank details for Chi' });
    await userEvent.click(addBankBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/t/t-1/people/${PIDS.C}/bank`));
    expect(await screen.findByRole('heading', { level: 1, name: "Chi's bank details" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1'));
  });

  it('row 11: pay screen → guest bank → Back returns to the pay screen', async () => {
    mockMedia({ wide: false });
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips/t-1': tripView(),
      'GET /api/trips/t-1/version': { version: 1 },
      [`GET /api/trips/t-1/pay/${PIDS.C}`]: {
        to: { id: PIDS.C, name: 'Chi' },
        amount: 500000,
        bankState: 'none',
        payload: null,
        inFlight: [],
      },
    });
    renderApp(`/t/t-1/pay/${PIDS.C}`);

    const addBankBtn = await screen.findByRole('link', { name: 'Add bank details for Chi' });
    await userEvent.click(addBankBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/t/t-1/people/${PIDS.C}/bank`));
    expect(await screen.findByRole('heading', { level: 1, name: "Chi's bank details" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/t/t-1/pay/${PIDS.C}`));
  });

  it('row 12: person → People → guest bank → Back → Back returns to the person', async () => {
    mockMedia({ wide: false });
    const tuan: PersonSummary = {
      key: 'p:p-tuan',
      name: 'Tuấn',
      nickname: null,
      userId: null,
      groupLabel: 'Đà Lạt · Oct 2026',
      total: -80000,
      items: [
        {
          tripId: 't-1',
          tripName: 'Đà Lạt · Oct 2026',
          kind: 'group',
          amount: -80000,
          otherPid: PIDS.C,
          ownerPid: PIDS.M,
          oldestOpenAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      waiting: [],
      linked: [],
    };
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { incomplete: false, people: [tuan] },
      'GET /api/trips/t-1': tripView(),
      'GET /api/trips/t-1/version': { version: 1 },
    });
    renderApp('/people/p%3Ap-tuan');

    const manageBtn = await screen.findByRole('link', { name: /Rename or merge in/ });
    await userEvent.click(manageBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/people'));
    expect(await screen.findByRole('heading', { level: 1, name: 'People' })).toBeInTheDocument();

    const chiRow = screen.getByRole('button', { name: /^Chi,/ });
    await userEvent.click(chiRow);

    const bankAction = await screen.findByRole('button', { name: 'Bank details' });
    await userEvent.click(bankAction);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/t/t-1/people/${PIDS.C}/bank`));
    expect(await screen.findByRole('heading', { level: 1, name: "Chi's bank details" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/people'));

    await userEvent.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/people/p%3Ap-tuan'));
  });

  it('opened by link, /me/bank Back goes to /trips', async () => {
    mockMedia({ wide: false });
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/me/bank': null,
    });
    renderApp('/me/bank');

    expect(await screen.findByRole('heading', { level: 1, name: 'Your bank details' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/trips'));
  });

  it('PayScreen "Back to trip" button returns to the group', async () => {
    mockMedia({ wide: false });
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips/t-1': guestChiView(),
      'GET /api/trips/t-1/version': { version: 3 },
      [`GET /api/trips/t-1/pay/${PIDS.M}`]: {
        to: { id: PIDS.M, name: 'Minh' },
        amount: 1245000,
        bankState: 'ok',
        bank: { bin: '970407', bankName: 'Techcombank', accountNumber: '19031234565678', accountNumberMasked: '1903 •••• 5678', holderName: 'NGUYEN VAN MINH' },
        refCode: 'DALAT C7K2',
        payload: null,
        inFlight: [
          {
            id: 'pay-1',
            fromId: PIDS.C,
            toId: PIDS.M,
            amountClaimed: 1245000,
            amountConfirmed: null,
            status: 'says_paid',
            notArrived: false,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    });
    renderApp('/t/t-1');

    const payBtn = await screen.findByRole('link', { name: 'Pay with VietQR' });
    await userEvent.click(payBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/t/t-1/pay/${PIDS.M}`));
    const backToTripBtn = await screen.findByRole('link', { name: 'Back to trip' });
    await userEvent.click(backToTripBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1'));
  });

  it('PayScreen "Back" button when nothing owed returns to the group', async () => {
    mockMedia({ wide: false });
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips/t-1': guestChiView(),
      'GET /api/trips/t-1/version': { version: 3 },
      [`GET /api/trips/t-1/pay/${PIDS.M}`]: {
        to: { id: PIDS.M, name: 'Minh' },
        amount: 0,
        bankState: 'ok',
        payload: null,
        inFlight: [],
      },
    });
    renderApp('/t/t-1');

    const payBtn = await screen.findByRole('link', { name: 'Pay with VietQR' });
    await userEvent.click(payBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/t/t-1/pay/${PIDS.M}`));
    const backBtn = await screen.findByRole('link', { name: 'Back' });
    await userEvent.click(backBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1'));
  });
});
