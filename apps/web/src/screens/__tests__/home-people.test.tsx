import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { Home } from '../Home';

const me = (consentAt: string | null = '2026-10-12T00:00:00.000Z') => ({
  user: {
    id: 'u-minh',
    email: 'minh@example.com',
    name: 'Minh',
    consentAt,
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Home screen', () => {
  it('Linh appears under "Owed to you" and Tuấn under "You owe"; a person with total 0 is not shown', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/trips': [],
      'GET /api/me/ledger': { tripId: 't-ledger', ownerPid: 'p-me' },
      'GET /api/me/people/summary': {
        people: [
          {
            key: 'u:u-linh',
            name: 'Linh',
            nickname: 'chị Linh',
            userId: 'u-linh',
            groupLabel: null,
            total: 350000,
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
          {
            key: 'p:p-zero',
            name: 'Zero Person',
            nickname: null,
            userId: null,
            groupLabel: null,
            total: 0,
            items: [],
            waiting: [],
          },
        ],
        incomplete: false,
      },
    });

    renderAt(<Home />, { route: '/trips' });

    const owedHeading = await screen.findByRole('heading', { name: 'Owed to you' });
    const oweHeading = screen.getByRole('heading', { name: 'You owe' });

    const linhRow = screen.getByTestId('person-row-u:u-linh');
    expect(within(linhRow).getByText('Linh')).toBeInTheDocument();
    expect(within(linhRow).getByText(/"chị Linh"/)).toBeInTheDocument();
    expect(within(linhRow).getByText('+')).toBeInTheDocument();
    expect(within(linhRow).getByText('350.000₫')).toBeInTheDocument();

    const tuanRow = screen.getByTestId('person-row-p:p-tuan');
    expect(within(tuanRow).getByText('Tuấn')).toBeInTheDocument();
    expect(within(tuanRow).getByText('Đà Lạt')).toBeInTheDocument();
    expect(within(tuanRow).getByText('−')).toBeInTheDocument();
    expect(within(tuanRow).getByText('80.000₫')).toBeInTheDocument();

    const owedSection = owedHeading.closest('section')!;
    expect(within(owedSection).getByTestId('person-row-u:u-linh')).toBeInTheDocument();
    expect(within(owedSection).queryByTestId('person-row-p:p-tuan')).not.toBeInTheDocument();

    const oweSection = oweHeading.closest('section')!;
    expect(within(oweSection).getByTestId('person-row-p:p-tuan')).toBeInTheDocument();
    expect(within(oweSection).queryByTestId('person-row-u:u-linh')).not.toBeInTheDocument();

    expect(screen.queryByText('Zero Person')).not.toBeInTheDocument();
    expect(screen.queryByTestId('person-row-p:p-zero')).not.toBeInTheDocument();
  });

  it('clicking person-row-u:u-linh navigates: screen.getByTestId("location") has text "/people/u%3Au-linh"', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/trips': [],
      'GET /api/me/ledger': { tripId: 't-ledger', ownerPid: 'p-me' },
      'GET /api/me/people/summary': {
        people: [
          {
            key: 'u:u-linh',
            name: 'Linh',
            nickname: 'chị Linh',
            userId: 'u-linh',
            groupLabel: null,
            total: 350000,
            items: [],
            waiting: [],
          },
        ],
        incomplete: false,
      },
    });

    renderAt(<Home />, { route: '/trips' });

    const linhRow = await screen.findByTestId('person-row-u:u-linh');
    await userEvent.click(linhRow);

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/people/u%3Au-linh');
    });
  });

  it('home-new-expense has href "/t/t-ledger/expenses/new"', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/trips': [],
      'GET /api/me/ledger': { tripId: 't-ledger', ownerPid: 'p-me' },
      'GET /api/me/people/summary': {
        people: [],
        incomplete: false,
      },
    });

    renderAt(<Home />, { route: '/trips' });

    const newExpenseButton = await screen.findByTestId('home-new-expense');
    expect(newExpenseButton).toHaveAttribute('href', '/t/t-ledger/expenses/new');
  });

  it('clicking home-tab-groups shows the MyTrips empty state text "Create your first group"', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/trips': [],
      'GET /api/me/ledger': { tripId: 't-ledger', ownerPid: 'p-me' },
      'GET /api/me/people/summary': {
        people: [],
        incomplete: false,
      },
    });

    renderAt(<Home />, { route: '/trips' });

    const groupsTab = await screen.findByTestId('home-tab-groups');
    await userEvent.click(groupsTab);

    expect(await screen.findByText('Create your first group')).toBeInTheDocument();
  });

  it('with people: [] it shows "No open debts"', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/trips': [],
      'GET /api/me/ledger': { tripId: 't-ledger', ownerPid: 'p-me' },
      'GET /api/me/people/summary': {
        people: [],
        incomplete: false,
      },
    });

    renderAt(<Home />, { route: '/trips' });

    expect(await screen.findByText('No open debts')).toBeInTheDocument();
    expect(screen.getByText('Add an expense and pick who shares it.')).toBeInTheDocument();
  });

  it('shows "Still adding up a few groups…" when incomplete is true', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/trips': [],
      'GET /api/me/ledger': { tripId: 't-ledger', ownerPid: 'p-me' },
      'GET /api/me/people/summary': {
        people: [],
        incomplete: true,
      },
    });

    renderAt(<Home />, { route: '/trips' });

    expect(await screen.findByText('Still adding up a few groups…')).toBeInTheDocument();
  });

  it('defaults to groups tab when ?tab=groups is in the URL', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/trips': [],
      'GET /api/me/ledger': { tripId: 't-ledger', ownerPid: 'p-me' },
      'GET /api/me/people/summary': {
        people: [],
        incomplete: false,
      },
    });

    renderAt(<Home />, { route: '/trips?tab=groups' });

    expect(await screen.findByText('Create your first group')).toBeInTheDocument();
  });

  it('defaults to groups tab when ?mergeReview=... is in the URL', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/trips': [],
      'GET /api/me/ledger': { tripId: 't-ledger', ownerPid: 'p-me' },
      'GET /api/me/people/summary': {
        people: [],
        incomplete: false,
      },
    });

    renderAt(<Home />, { route: '/trips?mergeReview=req-123' });

    expect(await screen.findByText('Create your first group')).toBeInTheDocument();
  });

  it('keeps a settled person listed while their payment waits for me', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/trips': [],
      'GET /api/me/ledger': { tripId: 't-ledger', ownerPid: 'p-me' },
      'GET /api/me/people/summary': {
        people: [
          {
            key: 'p:p-minh', name: 'Minh', nickname: null, userId: null, groupLabel: null, total: 0, items: [],
            waiting: [{ settlementId: 's-1', amount: 120000, direction: 'toOwner' }],
          },
        ],
        incomplete: false,
      },
    });

    renderAt(<Home />, { route: '/trips' });

    const row = await screen.findByTestId('person-row-p:p-minh');
    expect(within(row).getByText('Waiting for you to confirm')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Owed to you' })).toBeInTheDocument();
    expect(screen.queryByText('No open debts')).not.toBeInTheDocument();
  });
});
