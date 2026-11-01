import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MyActivityItem, MyActivityPage } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { MyActivity } from '../MyActivity';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MyActivity', () => {
  it('activity shows lines from several groups with their names and loads more', async () => {
    mockMedia({ wide: false });

    const page1Item1: MyActivityItem = {
      id: 'a1',
      tripId: 't-badminton',
      tripName: 'Badminton',
      kind: 'group',
      action: 'expense_added',
      actorName: 'Minh',
      deviceShort: null,
      details: {
        description: 'Shuttlecocks',
        amount: 150000,
        expenseId: 'exp-1',
      },
      createdAt: '2026-10-31T10:00:00.000Z',
      names: {},
    };

    const page1Item2: MyActivityItem = {
      id: 'a2',
      tripId: 't-led',
      tripName: 'Quick expenses',
      kind: 'direct',
      action: 'payment_recorded',
      actorName: null,
      deviceShort: null,
      details: {
        fromId: 'fromId',
        toId: 'toId',
        amount: 200000,
        paymentId: 'pay-1',
      },
      createdAt: '2026-10-31T09:00:00.000Z',
      names: {
        fromId: 'Minh',
        toId: 'Nhan',
      },
    };

    const page2Item: MyActivityItem = {
      id: 'a3',
      tripId: 't-badminton',
      tripName: 'Badminton',
      kind: 'group',
      action: 'expense_added',
      actorName: 'Nhan',
      deviceShort: null,
      details: {
        description: 'Court fee',
        amount: 300000,
        expenseId: 'exp-2',
      },
      createdAt: '2026-10-30T10:00:00.000Z',
      names: {},
    };

    const api = mockApi({
      'GET /api/me': {
        user: {
          id: 'u-me',
          name: 'Me',
          email: 'me@example.com',
          consentAt: '2026-10-12T00:00:00.000Z',
          providers: ['google'],
        },
        signIn: { zalo: false },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/activity': (_init: RequestInit | undefined, url: string) => {
        if (url.includes('before=c1')) {
          return Response.json({
            items: [page2Item],
            next: null,
          } satisfies MyActivityPage);
        }
        return Response.json({
          items: [page1Item1, page1Item2],
          next: 'c1',
        } satisfies MyActivityPage);
      },
    });

    renderAt(<MyActivity />, { route: '/activity' });

    expect(await screen.findByText(/Shuttlecocks/)).toBeInTheDocument();
    expect(screen.getByText(/Minh paid Nhan/)).toBeInTheDocument();
    expect(screen.getByText(/Badminton/)).toBeInTheDocument();

    const loadMoreBtn = screen.getByTestId('activity-load-more');
    expect(loadMoreBtn).toBeInTheDocument();

    await userEvent.click(loadMoreBtn);

    expect(await screen.findByText(/Court fee/)).toBeInTheDocument();

    expect(
      api.fetchMock.mock.calls.some(([input]) => String(input).includes('/api/me/activity?before=c1')),
    ).toBe(true);

    const activityCalls = api.calls.filter(
      (c) => c.method === 'GET' && c.path === '/api/me/activity',
    );
    expect(activityCalls.length).toBeGreaterThanOrEqual(2);

    expect(screen.queryByTestId('activity-load-more')).not.toBeInTheDocument();
  });

  it('a quick-expense line is labelled Quick expenses', async () => {
    mockMedia({ wide: false });

    const directItem: MyActivityItem = {
      id: 'a-quick',
      tripId: 't-led',
      tripName: 'Secret Ledger',
      kind: 'direct',
      action: 'expense_added',
      actorName: 'Me',
      deviceShort: null,
      details: {
        description: 'Morning Coffee',
        amount: 35000,
        expenseId: 'exp-coffee',
      },
      createdAt: '2026-10-31T11:00:00.000Z',
      names: {},
    };

    mockApi({
      'GET /api/me': {
        user: {
          id: 'u-me',
          name: 'Me',
          email: 'me@example.com',
          consentAt: '2026-10-12T00:00:00.000Z',
          providers: ['google'],
        },
        signIn: { zalo: false },
        mergeRequests: { incoming: [], outgoing: [] },
      },
      'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'p-me' },
      'GET /api/me/activity': () =>
        Response.json({
          items: [directItem],
          next: null,
        } satisfies MyActivityPage),
    });

    renderAt(<MyActivity />, { route: '/activity' });

    const line = await screen.findByText(/Morning Coffee/);
    expect(line).toBeInTheDocument();

    const row = line.closest('.fsl-activity__row')!;
    const meta = row.querySelector('.fsl-activity__meta')!;
    expect(meta.textContent).toContain('Quick expenses');
    expect(meta.textContent).not.toContain('Secret Ledger');
  });
});
