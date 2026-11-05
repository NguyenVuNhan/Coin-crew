import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigationType } from 'react-router';
import type { ExpenseView, MyActivityItem, PersonSummary, TripView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { tripView, guestChiView, viewerView, picker, PIDS } from '../../test/fixtures';
import { linkTokens } from '@cc/web-util/linkTokens';
import { sportFundView } from '../../test/fundFixtures';
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

    expect(await screen.findByRole('heading', { level: 1, name: 'Your groups' })).toBeInTheDocument();

    const accountBtn = await within(screen.getAllByRole('banner')[0]!).findByRole('button', { name: 'Account' });
    await userEvent.click(accountBtn);

    const menu = await screen.findByRole('dialog', { name: 'Account' });
    const bankLink = within(menu).getByRole('link', { name: 'Your bank details' });
    await userEvent.click(bankLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/me/bank'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Your bank details' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/groups'));
  });

  // The group page has no account menu (rewrite Part 3); Privacy opens from the groups list.
  it('row 9: groups → privacy → Back returns to the groups list', async () => {
    mockMedia({ wide: false });
    api();
    renderApp('/groups');

    expect(await screen.findByRole('heading', { level: 1, name: 'Your groups' })).toBeInTheDocument();

    const accountBtn = await within(screen.getAllByRole('banner')[0]!).findByRole('button', { name: 'Account' });
    await userEvent.click(accountBtn);
    const menu = await screen.findByRole('dialog', { name: 'Account' });
    await userEvent.click(within(menu).getByRole('link', { name: 'Privacy notice' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/privacy'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy notice' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/groups'));
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
    await userEvent.click(within(transferRow).getByRole('button', { name: /^You → Chi/ }));

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
    const backBtn = screen.getAllByRole('link', { name: 'Back' }).find((el) => !el.classList.contains('fsl-screen__back'))!;
    await userEvent.click(backBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1'));
  });
});

/** PUSH, REPLACE or POP: how the router got to the current page. */
function NavigationKind() {
  return <div data-testid="navigation-kind">{useNavigationType()}</div>;
}

function renderAppWithKind(initialEntry: string) {
  return renderAt(
    <>
      <NavigationKind />
      <App />
    </>,
    { route: initialEntry, path: '*' },
  );
}

/** A member who is a Group Admin but not the organiser: An, signed in. Minh created the trip. */
function anView(): TripView {
  const base = tripView();
  return {
    ...base,
    me: { kind: 'member', participantId: PIDS.A, participantPending: false, isOrganiser: false, isAdmin: true },
    people: base.people.map((p) => {
      if (p.id === PIDS.M) return { ...p, isOrganiser: true, isAdmin: true };
      if (p.id === PIDS.A) return { ...p, isMember: true, isAdmin: true };
      return p;
    }),
  };
}

describe('finished steps', () => {
  it('create group → the group → Back returns to Groups, not the form', async () => {
    mockMedia({ wide: false });
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips': [],
      'POST /api/trips': () => Response.json({ tripId: 't-new' }, { status: 201 }),
      'GET /api/trips/t-new': tripView({
        trip: {
          id: 't-new',
          name: 'Summer Trip',
          currency: 'VND',
          fewestTransfers: true,
          archived: false,
          version: 1,
          total: 0,
          preset: 'trip',
        },
      }),
      'GET /api/trips/t-new/version': { version: 1 },
    });
    renderApp('/groups');

    expect(await screen.findByText('Create your first group')).toBeInTheDocument();
    const newGroupLink = screen.getByRole('link', { name: 'New group' });
    await userEvent.click(newGroupLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/trips/new'));

    await userEvent.type(screen.getByLabelText('Group name'), 'Summer Trip');
    await userEvent.type(screen.getAllByPlaceholderText('Name')[0]!, 'An');

    const submitBtn = screen.getByRole('button', { name: 'Create group' });
    await userEvent.click(submitBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-new'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Summer Trip' })).toBeInTheDocument();

    const backLink = screen.getByRole('link', { name: 'Back' });
    await userEvent.click(backLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/groups'));
  });

  it('archive from settings returns to the group and Back leaves it', async () => {
    mockMedia({ wide: false });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let archived = false;
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips': [
        { id: 't-1', name: 'Đà Lạt · Oct 2026', archived: false, myBalance: 500000 },
      ],
      'GET /api/trips/t-1': () => Response.json(tripView({ trip: { ...tripView().trip, archived } })),
      'GET /api/trips/t-1/version': { version: 1 },
      'POST /api/trips/t-1/archive': () => {
        archived = true;
        return new Response(null, { status: 204 });
      },
    });
    renderApp('/groups');

    const groupLink = await screen.findByRole('link', { name: /Đà Lạt/ });
    await userEvent.click(groupLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();

    const settingsLink = await screen.findByRole('link', { name: 'Trip settings' });
    await userEvent.click(settingsLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/settings'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Group settings' })).toBeInTheDocument();

    const archiveBtn = await screen.findByRole('button', { name: 'Archive group' });
    await userEvent.click(archiveBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();

    const backLink = screen.getByRole('link', { name: 'Back' });
    await userEvent.click(backLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/groups'));
    confirm.mockRestore();
  });

  it('leave and sign out replace the page', async () => {
    mockMedia({ wide: false });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips': [
        { id: 't-1', name: 'Đà Lạt · Oct 2026', archived: false, myBalance: 500000 },
      ],
      'GET /api/trips/t-1': anView(),
      'GET /api/trips/t-1/version': { version: 1 },
      'POST /api/trips/t-1/leave': null,
    });
    const { unmount } = renderAppWithKind('/groups');

    const groupLink = await screen.findByRole('link', { name: /Đà Lạt/ });
    await userEvent.click(groupLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1'));

    const settingsLink = await screen.findByRole('link', { name: 'Trip settings' });
    await userEvent.click(settingsLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/settings'));

    const leaveBtn = await screen.findByRole('button', { name: 'Leave group' });
    await userEvent.click(leaveBtn);

    await waitFor(() => expect(screen.getByTestId('navigation-kind')).toHaveTextContent('REPLACE'));
    unmount();

    let currentUser: unknown = meUser;
    mockApi({
      'GET /api/me': () => Response.json(currentUser),
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips': [
        { id: 't-1', name: 'Đà Lạt · Oct 2026', archived: false, myBalance: 500000 },
      ],
      'POST /api/auth/logout': () => {
        currentUser = { user: null };
        return new Response(null, { status: 204 });
      },
    });
    renderAppWithKind('/groups');

    expect(await screen.findByRole('heading', { level: 1, name: 'Your groups' })).toBeInTheDocument();

    const accountBtn = await within(screen.getAllByRole('banner')[0]!).findByRole('button', { name: 'Account' });
    await userEvent.click(accountBtn);

    const menu = await screen.findByRole('dialog', { name: 'Account' });
    const signOutBtn = within(menu).getByRole('button', { name: 'Sign out' });
    await userEvent.click(signOutBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'));
    expect(screen.getByTestId('navigation-kind')).toHaveTextContent('REPLACE');
    confirm.mockRestore();
  });

  it('Switch → pick a name → back on the group with no extra entry', async () => {
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
    linkTokens.set('t-1', 'tok-1');
    let currentParticipantId = PIDS.C;
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [tuan], incomplete: false },
      'GET /api/links/tok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' },
      'GET /api/trips/t-1': () => Response.json({
        ...guestChiView(),
        me: { kind: 'guest', participantId: currentParticipantId, participantPending: false, isOrganiser: false },
      }),
      'GET /api/trips/t-1/version': { version: 3 },
      'GET /api/trips/t-1/people/picker': picker(),
      'POST /api/trips/t-1/people/pick': (init: RequestInit | undefined) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (body.participantId) {
          currentParticipantId = body.participantId;
        }
        return new Response(null, { status: 204 });
      },
    });
    renderApp('/people/p%3Ap-tuan');

    const groupLink = await screen.findByTestId('person-item-t-1');
    await userEvent.click(groupLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/j/tok-1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();

    const switchLink = await screen.findByRole('link', { name: /Switch/ });
    await userEvent.click(switchLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/j/tok-1/who'));

    const binhRadio = await screen.findByRole('radio', { name: /^Bình/ });
    await userEvent.click(binhRadio);

    const continueBtn = await screen.findByRole('button', { name: 'Continue as Bình' });
    await userEvent.click(continueBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/j/tok-1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();

    const backBtn = await screen.findByRole('button', { name: 'Back' });
    await userEvent.click(backBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/people/p%3Ap-tuan'));
  });

  it('row 2: person → a group I only view → Back returns to the person', async () => {
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
    linkTokens.set('t-1', 'vtok-1');
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [tuan], incomplete: false },
      'GET /api/links/vtok-1': { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'view' },
      'GET /api/trips/t-1': viewerView(),
      'GET /api/trips/t-1/version': { version: 3 },
    });
    renderApp('/people/p%3Ap-tuan');

    const groupLink = await screen.findByTestId('person-item-t-1');
    await userEvent.click(groupLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/j/vtok-1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();

    const backBtn = screen.getByRole('button', { name: 'Back' });
    await userEvent.click(backBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/people/p%3Ap-tuan'));
  });

  it('a guest group opened by link has no back arrow', async () => {
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
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Back' })).toBeNull();
  });

  it('new sport expense → its details → Back returns to the group', async () => {
    mockMedia({ wide: false });
    const view = sportFundView();
    const createdExpense: ExpenseView = {
      id: 'e-sport-1',
      description: 'Badminton court',
      amount: 240000,
      spentOn: '2026-10-31',
      payerId: PIDS.M,
      mode: 'equal' as const,
      status: 'approved',
      rejectReason: null,
      disabledByName: null,
      createdById: PIDS.M,
      shares: view.people.map((p) => ({ participantId: p.id, amount: 60000, inputValue: 1 })),
    };
    const viewWithExpense = {
      ...view,
      expenses: [createdExpense, ...view.expenses],
    };

    let currentView = view;
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips/t-1': () => Response.json(currentView),
      'GET /api/trips/t-1/version': { version: 1 },
      'POST /api/trips/t-1/expenses': () => {
        currentView = viewWithExpense;
        return Response.json({ expenseId: 'e-sport-1' }, { status: 201 });
      },
    });
    renderApp('/t/t-1');

    const navBar = await screen.findByTestId('app-nav-bar');
    const addBtn = within(navBar).getByTestId('nav-add');
    await userEvent.click(addBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/new'));

    await userEvent.type(await screen.findByLabelText('What for'), 'Badminton court');
    await userEvent.type(screen.getByLabelText('Court'), '240k');

    const submitBtn = screen.getByRole('button', { name: 'Add expense' });
    await userEvent.click(submitBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-sport-1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Expense' })).toBeInTheDocument();

    const backBtn = screen.getByRole('button', { name: 'Back' });
    await userEvent.click(backBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
  });
});

type PaymentItem = TripView['payments'][number];
const payment = (p: Partial<PaymentItem> & Pick<PaymentItem, 'id' | 'fromId' | 'toId' | 'status'>): PaymentItem => ({
  amountClaimed: 100000,
  amountConfirmed: p.status === 'confirmed' ? 100000 : null,
  notArrived: false,
  createdAt: '2026-10-12T08:00:00.000Z',
  ...p,
});

describe('page comes back as left', () => {
  it('row 6: wide, Activity → ledger item → × returns to Activity', async () => {
    mockMedia({ wide: true });
    api();
    renderApp('/activity');

    const item = await screen.findByRole('link', { name: /Taxi/ });
    await userEvent.click(item);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/trips'));
    const panel = await screen.findByRole('region', { name: 'Expense' });
    expect(panel).toBeInTheDocument();

    const closeBtn = within(panel).getByRole('button', { name: 'Close' });
    await userEvent.click(closeBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/activity'));
  });

  it('selecting rows on Home then × stays on Home', async () => {
    mockMedia({ wide: true });
    api();
    renderApp('/trips');

    const row = await screen.findByRole('button', { name: /^Taxi/ });
    await userEvent.click(row);

    const panel = await screen.findByRole('region', { name: 'Expense' });
    expect(panel).toBeInTheDocument();

    const closeBtn = within(panel).getByRole('button', { name: 'Close' });
    await userEvent.click(closeBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/trips$/));
    expect(screen.queryByRole('region', { name: 'Expense' })).toBeNull();
    expect(screen.getByTestId('home-total')).toBeInTheDocument();
  });

  it('group page comes back on Payments after details', async () => {
    mockMedia({ wide: false });
    const view = tripView({
      payments: [
        payment({ id: 'pay-1', fromId: PIDS.C, toId: PIDS.M, status: 'confirmed' }),
      ],
    });
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips': [
        { id: 't-1', name: 'Đà Lạt · Oct 2026', archived: false, myBalance: 500000 },
      ],
      'GET /api/trips/t-1': view,
      'GET /api/trips/t-1/version': { version: 3 },
      'GET /api/trips/t-led': ledgerView(),
      'GET /api/trips/t-led/version': { version: 1 },
    });
    renderApp('/t/t-1');

    const paymentsTab = await screen.findByRole('tab', { name: 'Payments' });
    await userEvent.click(paymentsTab);
    expect(paymentsTab).toHaveAttribute('aria-selected', 'true');

    const paymentRow = await screen.findByRole('button', { name: /^Chi → You, 100.000₫, Paid/ });
    await userEvent.click(paymentRow);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/payments/pay-1'));
    expect(await screen.findByRole('button', { name: 'Back' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    expect(await screen.findByRole('tab', { name: 'Payments' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Expenses' })).toHaveAttribute('aria-selected', 'false');
  });

  it('Home comes back on Payments after a ledger payment', async () => {
    mockMedia({ wide: false });
    const ledgerWithPayment = {
      ...ledgerView(),
      payments: [
        payment({ id: 'pay-led-1', fromId: 'p-minh', toId: 'p-me', status: 'confirmed' }),
      ],
    };
    mockApi({
      'GET /api/me': meUser,
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/people/summary': { people: [], incomplete: false },
      'GET /api/trips': [],
      'GET /api/trips/t-led': ledgerWithPayment,
      'GET /api/trips/t-led/version': { version: 1 },
      'GET /api/me/activity': { items: [], next: null },
    });
    renderApp('/trips');

    const paymentsTab = await screen.findByRole('tab', { name: 'Payments' });
    await userEvent.click(paymentsTab);
    expect(paymentsTab).toHaveAttribute('aria-selected', 'true');

    const paymentRow = await screen.findByRole('button', { name: /^Minh → You/ });
    await userEvent.click(paymentRow);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-led/payments/pay-led-1'));
    expect(await screen.findByRole('button', { name: 'Back' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/trips$/));
    expect(await screen.findByRole('tab', { name: 'Payments' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Expenses' })).toHaveAttribute('aria-selected', 'false');
  });

  it('group page comes back at its scroll position after details', async () => {
    mockMedia({ wide: false });
    api();
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('scrollY', 300);

    renderApp('/t/t-1');

    const row = await screen.findByRole('button', { name: /^Homestay Bloom/ });
    await userEvent.click(row);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Expense' })).toBeInTheDocument();

    vi.stubGlobal('scrollY', 0);

    const backBtn = screen.getByRole('button', { name: 'Back' });
    await userEvent.click(backBtn);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith(0, 300));
  });

  it('a new visit to the group starts on Expenses', async () => {
    mockMedia({ wide: false });
    api();
    renderApp('/groups');

    const groupLink = await screen.findByRole('link', { name: /Đà Lạt/ });
    await userEvent.click(groupLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();

    const paymentsTab = await screen.findByRole('tab', { name: 'Payments' });
    await userEvent.click(paymentsTab);
    expect(paymentsTab).toHaveAttribute('aria-selected', 'true');

    const backLink = screen.getByRole('link', { name: 'Back' });
    await userEvent.click(backLink);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/groups$/));

    const groupLinkAgain = await screen.findByRole('link', { name: /Đà Lạt/ });
    await userEvent.click(groupLinkAgain);

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Đà Lạt · Oct 2026' })).toBeInTheDocument();

    expect(await screen.findByRole('tab', { name: 'Expenses' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Payments' })).toHaveAttribute('aria-selected', 'false');
  });
  it('wide: opening a row in the panel keeps the list where it was scrolled', async () => {
    mockMedia({ wide: true });
    api();
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('scrollY', 300);
    renderApp('/t/t-1');

    await userEvent.click(await screen.findByRole('button', { name: /^Homestay Bloom/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/expenses/e-1'));
    expect(scrollTo).not.toHaveBeenCalledWith(0, 0);
  });
});
