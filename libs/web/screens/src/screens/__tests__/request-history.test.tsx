import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
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

async function openCovers() {
  await userEvent.click(await screen.findByTestId('request-covers'));
  return screen.getByRole('dialog', { name: 'What makes this up' });
}

describe('RequestPage history', () => {
  it('the covers sheet has one row per place, collapsed', async () => {
    mockApi({ 'GET /api/r/tok': view({ lines: five }) });
    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });
    expect(await screen.findByTestId('request-covers')).toHaveTextContent('What this covers (2)');
    const sheet = await openCovers();
    expect(within(sheet).getByTestId('ledger-row-direct')).toHaveAttribute('aria-expanded', 'false');
    expect(within(sheet).getByTestId('ledger-row-t-other')).toHaveTextContent('Badminton');
    expect(within(sheet).queryByTestId('history-line-Coffee')).toBeNull();
  });

  it('tapping a row expands the compact list, tapping again folds it', async () => {
    mockApi({ 'GET /api/r/tok': view({ lines: five }) });
    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });
    const sheet = await openCovers();
    const row = within(sheet).getByTestId('ledger-row-direct');
    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(within(sheet).getByTestId('history-line-Coffee')).toBeInTheDocument();
    await userEvent.click(row);
    expect(within(sheet).queryByTestId('history-line-Coffee')).toBeNull();
  });

  it('gap item shows the rerouted line', async () => {
    const v = view({});
    v.items[1] = {
      ...v.items[1]!,
      amount: 150000,
      lines: [line('Room', { tripId: 't-other', effect: 300000 })],
      gap: { kind: 'reroute', difference: -150000, viaPid: null },
    };
    mockApi({ 'GET /api/r/tok': v });
    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });
    const sheet = await openCovers();
    await userEvent.click(within(sheet).getByTestId('ledger-row-t-other'));
    expect(within(sheet).getByText('Between you two')).toBeInTheDocument();
    expect(
      within(sheet).getByText('To save transfers, the group changed this to 150.000₫.'),
    ).toBeInTheDocument();
  });
});
