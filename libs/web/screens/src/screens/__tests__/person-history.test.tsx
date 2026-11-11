import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { HistoryLine, PersonHistoryView, PersonSummary } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { PersonScreen } from '../PersonScreen';

const me = () => ({
  user: { id: 'u-minh', email: 'minh@example.com', name: 'Minh', consentAt: '2026-10-12T00:00:00.000Z' },
});

const line = (over: Partial<HistoryLine> & Pick<HistoryLine, 'id' | 'tripId' | 'createdAt'>): HistoryLine => ({
  kind: 'expense',
  title: 'Lunch',
  date: over.createdAt.slice(0, 10),
  amount: 200000,
  paidBy: 'owner',
  ownerShare: 100000,
  otherShare: 100000,
  effect: 100000,
  state: 'counted',
  ...over,
});

const an: PersonSummary = {
  key: 'u:u-an',
  name: 'An',
  nickname: null,
  userId: 'u-an',
  groupLabel: null,
  total: 250000,
  items: [
    {
      tripId: 't-led',
      tripName: 'An',
      kind: 'direct',
      amount: 300000,
      oldestOpenAt: '2026-10-01T00:00:00.000Z',
      ownerPid: 'led-o',
      otherPid: 'led-a',
    },
    {
      tripId: 't-bad',
      tripName: 'Badminton',
      kind: 'group',
      amount: -50000,
      oldestOpenAt: '2026-10-02T00:00:00.000Z',
      ownerPid: 'b-o',
      otherPid: 'b-a',
    },
  ],
  waiting: [],
  linked: [],
};

const allHistory: PersonHistoryView = {
  key: 'u:u-an',
  name: 'An',
  mode: 'all',
  total: 250000,
  places: [
    {
      tripId: 't-led',
      tripName: 'An',
      kind: 'direct',
      source: 'own',
      amount: 200000,
      history: {
        lines: [line({ id: 'e-old', tripId: 't-led', title: 'Taxi', createdAt: '2026-10-01T10:00:00.000Z', effect: 200000 })],
        twoWay: 200000,
        suggested: 200000,
        gap: null,
        trimmed: false,
      },
    },
    {
      tripId: 't-theirs',
      tripName: 'Minh',
      kind: 'direct',
      source: 'theirs',
      amount: 100000,
      history: {
        lines: [line({ id: 'e-new', tripId: 't-theirs', title: 'Pho', createdAt: '2026-10-05T10:00:00.000Z' })],
        twoWay: 100000,
        suggested: 100000,
        gap: null,
        trimmed: false,
      },
    },
    { tripId: 't-bad', tripName: 'Badminton', kind: 'group', source: 'group', amount: -50000, history: null },
  ],
};

const groupHistory: PersonHistoryView = {
  key: 'u:u-an',
  name: 'An',
  mode: 'group',
  total: 210000,
  places: [
    {
      tripId: 't-bad',
      tripName: 'Badminton',
      kind: 'group',
      source: 'group',
      amount: 210000,
      history: {
        lines: [line({ id: 'e-court', tripId: 't-bad', title: 'Court', createdAt: '2026-10-03T10:00:00.000Z', effect: 300000 })],
        twoWay: 300000,
        suggested: 210000,
        gap: { kind: 'reroute', difference: -90000, viaPid: null },
        trimmed: false,
      },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PersonScreen history', () => {
  it('all mode: rows stay; quick-expense lines render under "What makes this up"; group row links to /t/<trip>', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [an] },
      'GET /api/me/people/u%3Au-an/history': allHistory,
    });

    renderAt(<PersonScreen />, { route: '/people/u%3Au-an', path: '/people/:key' });

    const section = await screen.findByTestId('person-history');
    expect(within(section).getByText('What makes this up')).toBeInTheDocument();
    const lines = await within(section).findAllByTestId(/^history-line-/);
    // Merged newest first across both direct places.
    expect(lines.map((l) => l.getAttribute('data-testid'))).toEqual(['history-line-e-new', 'history-line-e-old']);

    // The rows from the summary are unchanged.
    expect(within(screen.getByTestId('person-item-t-led')).getByText('Quick expenses')).toBeInTheDocument();
    expect(screen.getByTestId('person-item-t-bad')).toHaveAttribute('href', '/t/t-bad');
  });

  it('all mode: a history error shows only in its slot, with retry; the rows stay', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [an] },
    });

    renderAt(<PersonScreen />, { route: '/people/u%3Au-an', path: '/people/:key' });

    const section = await screen.findByTestId('person-history');
    expect(await within(section).findByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
    expect(screen.getByTestId('person-item-t-led')).toBeInTheDocument();
    expect(screen.getByTestId('person-item-t-bad')).toBeInTheDocument();
    expect(screen.getByTestId('person-request')).toBeInTheDocument();
  });

  it("all mode: a 'theirs' line shows \"In An's expenses\"", async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [an] },
      'GET /api/me/people/u%3Au-an/history': allHistory,
    });

    renderAt(<PersonScreen />, { route: '/people/u%3Au-an', path: '/people/:key' });

    const theirs = await screen.findByTestId('history-line-e-new');
    expect(within(theirs).getByText("In An's expenses")).toBeInTheDocument();
    expect(within(screen.getByTestId('history-line-e-old')).queryByText("In An's expenses")).not.toBeInTheDocument();
  });

  it('group mode: shows the group name, the group amount and the gap block; no Request button; "See everything with An" links to /people/<key>', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/trips/t-bad/people/b-a/history': groupHistory,
    });

    const { container } = renderAt(<PersonScreen />, {
      route: '/people/in/t-bad/b-a',
      path: '/people/in/:tripId/:pid',
    });

    expect(await screen.findByRole('heading', { level: 2, name: 'An' })).toBeInTheDocument();
    expect(container.querySelector('.fsl-person__group')).toHaveTextContent('Badminton');
    const total = container.querySelector('.fsl-person__total')!;
    expect(total).toHaveTextContent('Owes you');
    expect(total).toHaveTextContent('210.000');
    expect(container.querySelector('.fsl-history__gap')).toHaveTextContent('Between you two');
    expect(screen.getByText('To save transfers, the group changed this to 210.000₫.')).toBeInTheDocument();
    expect(screen.getByTestId('history-line-e-court')).toBeInTheDocument();

    expect(screen.queryByTestId('person-request')).not.toBeInTheDocument();
    expect(screen.queryByTestId('person-cash')).not.toBeInTheDocument();
    expect(screen.queryByTestId('person-edit')).not.toBeInTheDocument();

    const seeAll = screen.getByRole('link', { name: 'See everything with An' });
    expect(seeAll).toHaveAttribute('href', '/people/u%3Au-an');
  });

  it('settled: no history list, settled line shown', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/trips/t-bad/people/b-a/history': {
        ...groupHistory,
        total: 0,
        places: [
          {
            ...groupHistory.places[0]!,
            amount: 0,
            history: { lines: [], twoWay: 0, suggested: 0, gap: null, trimmed: false },
          },
        ],
      } satisfies PersonHistoryView,
    });

    const { container } = renderAt(<PersonScreen />, {
      route: '/people/in/t-bad/b-a',
      path: '/people/in/:tripId/:pid',
    });

    expect(await screen.findByText('All settled')).toBeInTheDocument();
    expect(container.querySelector('.fsl-history')).not.toBeInTheDocument();
  });
});
