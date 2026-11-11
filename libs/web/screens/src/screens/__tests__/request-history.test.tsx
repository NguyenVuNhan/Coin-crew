import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HistoryLine, RequestView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { RequestPage } from '../RequestPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

function line(id: string, over: Partial<HistoryLine> = {}): HistoryLine {
  return {
    id,
    kind: 'expense',
    tripId: 't-direct',
    title: id,
    date: '2026-11-01',
    createdAt: '2026-11-01T10:00:00Z',
    amount: 100000,
    paidBy: 'owner',
    ownerShare: 50000,
    otherShare: 50000,
    effect: 50000,
    state: 'counted',
    ...over,
  };
}

function view(item: Partial<RequestView['items'][number]>, extra: Partial<RequestView> = {}): RequestView {
  return {
    ownerName: 'Nhan',
    total: 150000,
    settled: false,
    settlementWaiting: false,
    items: [
      {
        tripId: 't-direct',
        tripName: '',
        kind: 'direct',
        amount: 150000,
        oldestOpenAt: '2026-10-30T10:00:00Z',
        ...item,
      },
      {
        tripId: 't-other',
        tripName: 'Badminton',
        kind: 'group',
        amount: 10000,
        oldestOpenAt: '2026-10-30T10:00:00Z',
      },
    ],
    pay: null,
    ...extra,
  };
}

const five = ['Lunch', 'Taxi', 'Coffee', 'Snack', 'Tea'].map((title, i) =>
  line(title, { title, createdAt: `2026-11-0${5 - i}T10:00:00Z` }),
);

describe('RequestPage history', () => {
  it('shows "Lunch, Taxi and 3 more" under a row with 5 lines', async () => {
    mockApi({ 'GET /api/r/tok': view({ lines: five }) });
    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });
    const btn = await screen.findByTestId('request-covers-t-direct');
    expect(btn).toHaveTextContent('Lunch, Taxi and 3 more');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('request-covers-t-other')).toBeNull();
  });

  it('tapping it expands the compact list', async () => {
    mockApi({ 'GET /api/r/tok': view({ lines: five }) });
    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });
    const btn = await screen.findByTestId('request-covers-t-direct');
    expect(screen.queryByTestId('history-line-Coffee')).toBeNull();
    await userEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('history-line-Coffee')).toBeInTheDocument();
    await userEvent.click(btn);
    expect(screen.queryByTestId('history-line-Coffee')).toBeNull();
  });

  it('gap item shows the rerouted line', async () => {
    mockApi({
      'GET /api/r/tok': view({
        amount: 150000,
        lines: [line('Room', { effect: 300000 })],
        gap: { kind: 'reroute', difference: -150000, viaPid: null },
      }),
    });
    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });
    await userEvent.click(await screen.findByTestId('request-covers-t-direct'));
    expect(screen.getByText('Between you two')).toBeInTheDocument();
    expect(
      screen.getByText('To save transfers, the group changed this to 150.000₫.'),
    ).toBeInTheDocument();
  });
});
