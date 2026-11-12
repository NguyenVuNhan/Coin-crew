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
  total: 510000,
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
      tripId: 't-1',
      tripName: 'Badminton',
      kind: 'group',
      amount: 210000,
      oldestOpenAt: '2026-10-02T00:00:00.000Z',
      ownerPid: 'b-o',
      otherPid: 'p-binh',
    },
  ],
  waiting: [],
  linked: [],
};

const groupPlace: PersonHistoryView['places'][number] = {
  tripId: 't-1',
  tripName: 'Badminton',
  kind: 'group',
  source: 'group',
  amount: 210000,
  history: {
    lines: [line({ id: 'e-court', tripId: 't-1', title: 'Court', createdAt: '2026-10-03T10:00:00.000Z', effect: 300000 })],
    twoWay: 300000,
    suggested: 210000,
    gap: { kind: 'reroute', difference: -90000, viaPid: null },
    trimmed: false,
  },
};

const allHistory: PersonHistoryView = {
  key: 'u:u-an',
  name: 'An',
  mode: 'all',
  total: 510000,
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
    groupPlace,
  ],
};

const groupHistory: PersonHistoryView = {
  key: 'u:u-an',
  name: 'An',
  mode: 'group',
  total: 210000,
  places: [groupPlace],
};

/** Shows the current path and query so tests can assert ?open. */
function UrlProbe() {
  const location = useLocation();
  return <div data-testid="url">{location.pathname + location.search}</div>;
}

function renderPerson(route: string) {
  return renderAt(
    <>
      <Routes>
        <Route path="/people/:key" element={<PersonScreen />} />
        <Route path="/people/in/:tripId/:pid" element={<PersonScreen />} />
      </Routes>
      <UrlProbe />
    </>,
    { route, path: '*' },
  );
}

const api = () =>
  mockApi({
    'GET /api/me': me(),
    'GET /api/me/people/summary': { incomplete: false, people: [an] },
    'GET /api/me/people/u%3Au-an/history': allHistory,
    'GET /api/me/trips/t-1/people/p-binh/history': groupHistory,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Person page ledger', () => {
  it('ledger rows and total render; tapping Quick expenses opens a sheet with its lines', async () => {
    api();
    const { container } = renderPerson('/people/u%3Au-an');

    const direct = await screen.findByTestId('person-item-t-led');
    expect(direct).toHaveTextContent('Quick expenses');
    expect(direct).toHaveTextContent('300.000');
    const group = screen.getByTestId('person-item-t-1');
    expect(group).toHaveTextContent('Badminton');
    const total = container.querySelector('.fsl-person__items .fsl-ledger__total')!;
    expect(total).toHaveTextContent('Total');
    expect(total).toHaveTextContent('510.000');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(direct);
    const sheet = await screen.findByRole('dialog', { name: 'Quick expenses' });
    const lines = within(sheet).getAllByTestId(/^history-line-/);
    expect(lines.map((l) => l.getAttribute('data-testid'))).toEqual(['history-line-e-new', 'history-line-e-old']);
    expect(within(screen.getByTestId('history-line-e-new')).getByText("In An's expenses")).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('/people/u%3Au-an?open=t-led');
  });

  it('?open=t-1 opens the group sheet with Between you two', async () => {
    api();
    const { container } = renderPerson('/people/u%3Au-an?open=t-1');

    const sheet = await screen.findByRole('dialog', { name: 'Badminton' });
    expect(within(sheet).getByTestId('history-line-e-court')).toBeInTheDocument();
    expect(container.ownerDocument.querySelector('.fsl-history__gap')).toHaveTextContent('Between you two');
    expect(within(sheet).getByTestId('ledger-open-group')).toHaveAttribute('href', '/t/t-1');
  });

  it('?open=<a direct trip> opens the merged Quick expenses sheet', async () => {
    api();
    renderPerson('/people/u%3Au-an?open=t-theirs');
    expect(await screen.findByRole('dialog', { name: 'Quick expenses' })).toBeInTheDocument();
  });

  it('?open=<a trip with nothing open> opens no sheet and does not crash', async () => {
    api();
    renderPerson('/people/u%3Au-an?open=t-nope');
    expect(await screen.findByTestId('person-item-t-1')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('/people/in/t-1/p-binh redirects to /people/<key>?open=t-1', async () => {
    api();
    renderPerson('/people/in/t-1/p-binh');

    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/people/u%3Au-an?open=t-1'));
    expect(await screen.findByRole('dialog', { name: 'Badminton' })).toBeInTheDocument();
  });

  it('closing the sheet drops ?open', async () => {
    api();
    renderPerson('/people/u%3Au-an?open=t-1');

    await screen.findByRole('dialog', { name: 'Badminton' });
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.getByTestId('url').textContent).toBe('/people/u%3Au-an'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a history error shows only in the ledger slot, with retry; the actions stay', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [an] },
    });
    const { container } = renderPerson('/people/u%3Au-an');

    await waitFor(() => expect(container.querySelector('.fsl-person__items')).not.toBeNull());
    const slot = container.querySelector('.fsl-person__items') as HTMLElement;
    expect(await within(slot).findByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
    expect(screen.getByTestId('person-request')).toBeInTheDocument();
  });
});
