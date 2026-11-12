import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
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

/** Shows the current path and query so the redirect can be asserted. */
function UrlProbe() {
  const location = useLocation();
  return <div data-testid="url">{location.pathname + location.search}</div>;
}

describe('PersonScreen history', () => {
  it('all mode: the ledger rows keep their test ids; the Quick expenses sheet shows the merged lines newest first; the group sheet links to /t/<trip>', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [an] },
      'GET /api/me/people/u%3Au-an/history': allHistory,
    });

    renderAt(<PersonScreen />, { route: '/people/u%3Au-an', path: '/people/:key' });

    const direct = await screen.findByTestId('person-item-t-led');
    expect(within(direct).getByText('Quick expenses')).toBeInTheDocument();
    expect(screen.queryByTestId('person-history')).not.toBeInTheDocument();

    await userEvent.click(direct);
    const sheet = await screen.findByRole('dialog', { name: 'Quick expenses' });
    const lines = within(sheet).getAllByTestId(/^history-line-/);
    // Merged newest first across both direct places.
    expect(lines.map((l) => l.getAttribute('data-testid'))).toEqual(['history-line-e-new', 'history-line-e-old']);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(screen.getByTestId('person-item-t-bad'));
    const group = await screen.findByRole('dialog', { name: 'Badminton' });
    expect(within(group).getByTestId('ledger-open-group')).toHaveAttribute('href', '/t/t-bad');
  });

  it('all mode: a history error shows only in its slot, with retry; the actions stay', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [an] },
    });

    const { container } = renderAt(<PersonScreen />, { route: '/people/u%3Au-an', path: '/people/:key' });

    await waitFor(() => expect(container.querySelector('.fsl-person__items')).not.toBeNull());
    const slot = container.querySelector('.fsl-person__items') as HTMLElement;
    expect(await within(slot).findByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
    expect(screen.getByTestId('person-request')).toBeInTheDocument();
  });

  it("all mode: a 'theirs' line shows \"In An's expenses\"", async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [an] },
      'GET /api/me/people/u%3Au-an/history': allHistory,
    });

    renderAt(<PersonScreen />, { route: '/people/u%3Au-an', path: '/people/:key' });

    await userEvent.click(await screen.findByTestId('person-item-t-led'));
    const theirs = await screen.findByTestId('history-line-e-new');
    expect(within(theirs).getByText("In An's expenses")).toBeInTheDocument();
    expect(within(screen.getByTestId('history-line-e-old')).queryByText("In An's expenses")).not.toBeInTheDocument();
  });

  it('group mode: /people/in/<trip>/<pid> replaces itself with /people/<key>?open=<trip>', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/trips/t-bad/people/b-a/history': groupHistory,
    });

    renderAt(
      <>
        <Routes>
          <Route path="/people/in/:tripId/:pid" element={<PersonScreen />} />
          <Route path="*" element={null} />
        </Routes>
        <UrlProbe />
      </>,
      { route: '/people/in/t-bad/b-a', path: '*' },
    );

    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/people/u%3Au-an?open=t-bad'));
  });

  it('group mode: an error shows with retry and no redirect', async () => {
    mockApi({ 'GET /api/me': me() });

    renderAt(<PersonScreen />, { route: '/people/in/t-bad/b-a', path: '/people/in/:tripId/:pid' });

    expect(await screen.findByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/people/in/t-bad/b-a');
  });
});
