import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PersonSummary } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { PersonScreen } from '../PersonScreen';

const me = (consentAt: string | null = '2026-10-12T00:00:00.000Z') => ({
  user: { id: 'u-minh', email: 'minh@example.com', name: 'Minh', consentAt },
});

const minh: PersonSummary = {
  key: 'u:u-minh',
  name: 'Minh',
  nickname: null,
  userId: 'u-minh',
  groupLabel: null,
  total: 270000,
  items: [
    {
      tripId: 't-led',
      tripName: 'Minh',
      kind: 'direct',
      amount: 370000,
      oldestOpenAt: '2026-10-01T00:00:00.000Z',
      ownerPid: 'led-o',
      otherPid: 'led-m',
    },
    {
      tripId: 't-bad',
      tripName: 'Badminton',
      kind: 'group',
      amount: -100000,
      oldestOpenAt: '2026-10-02T00:00:00.000Z',
      ownerPid: 'b-o',
      otherPid: 'b-m',
    },
    {
      tripId: 't-cafe',
      tripName: 'Coffee',
      kind: 'group',
      amount: 0,
      oldestOpenAt: '2026-10-03T00:00:00.000Z',
      ownerPid: 'c-o',
      otherPid: 'c-m',
    },
  ],
  waiting: [{ settlementId: 's-1', amount: 270000, direction: 'toOwner' }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PersonScreen', () => {
  it('shows three items (person-item-t-led, person-item-t-bad, person-item-t-cafe), "Quick expenses" and "Badminton"', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [minh] },
    });

    renderAt(<PersonScreen />, {
      route: '/people/u%3Au-minh',
      path: '/people/:key',
    });

    expect(await screen.findByTestId('person-item-t-led')).toBeInTheDocument();
    expect(screen.getByTestId('person-item-t-bad')).toBeInTheDocument();
    expect(screen.getByTestId('person-item-t-cafe')).toBeInTheDocument();
    expect(screen.getByText('Quick expenses')).toBeInTheDocument();
    expect(screen.getByText('Badminton')).toBeInTheDocument();
  });

  it('paid in cash: opens sheet; input holds "270000"; Save posts POST /api/me/people/u%3Au-minh/settle', async () => {
    const { calls } = mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [minh] },
      'POST /api/me/people/u%3Au-minh/settle': {
        settlementId: 's-2',
        status: 'confirmed',
      },
    });

    renderAt(<PersonScreen />, {
      route: '/people/u%3Au-minh',
      path: '/people/:key',
    });

    const cashBtn = await screen.findByTestId('person-cash');
    await userEvent.click(cashBtn);

    const input = screen.getByRole('textbox', { name: 'Amount' });
    expect(input).toHaveValue('270000');

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveBtn);

    await waitFor(() => {
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'POST',
            path: '/api/me/people/u%3Au-minh/settle',
            body: { paid: 270000, direction: 'toOwner' },
          }),
        ]),
      );
    });
  });

  it('request: calls navigator.share with request link url', async () => {
    const shareFn = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      value: shareFn,
      configurable: true,
      writable: true,
    });

    try {
      mockApi({
        'GET /api/me': me(),
        'GET /api/me/people/summary': { incomplete: false, people: [minh] },
        'POST /api/me/people/u%3Au-minh/request-link': { url: 'https://x/r/tok' },
      });

      renderAt(<PersonScreen />, {
        route: '/people/u%3Au-minh',
        path: '/people/:key',
      });

      const requestBtn = await screen.findByTestId('person-request');
      await userEvent.click(requestBtn);

      await waitFor(() => {
        expect(shareFn).toHaveBeenCalledWith(
          expect.objectContaining({ url: 'https://x/r/tok' }),
        );
      });
    } finally {
      // @ts-expect-error remove navigator.share stub
      delete navigator.share;
    }
  });

  it('confirm: clicking Confirm inside waiting-s-1 posts POST /api/me/settlements/s-1/confirm', async () => {
    const { calls } = mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [minh] },
      'POST /api/me/settlements/s-1/confirm': null,
    });

    renderAt(<PersonScreen />, {
      route: '/people/u%3Au-minh',
      path: '/people/:key',
    });

    const waitingRow = await screen.findByTestId('waiting-s-1');
    const confirmBtn = within(waitingRow).getByRole('button', { name: 'Confirm' });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(calls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'POST',
            path: '/api/me/settlements/s-1/confirm',
          }),
        ]),
      );
    });
  });

  it('a guest: person-settle has href /t/t-dl/pay/dl-t and a Rename or merge link goes to /t/t-dl/people', async () => {
    const tuan: PersonSummary = {
      key: 'p:p-tuan',
      name: 'Tuấn',
      nickname: null,
      userId: null,
      groupLabel: 'Đà Lạt',
      total: -80000,
      items: [
        {
          tripId: 't-dl',
          tripName: 'Đà Lạt',
          kind: 'group',
          amount: -80000,
          otherPid: 'dl-t',
          ownerPid: 'dl-o',
          oldestOpenAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      waiting: [],
    };

    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [tuan] },
    });

    renderAt(<PersonScreen />, {
      route: '/people/p%3Ap-tuan',
      path: '/people/:key',
    });

    const settleBtn = await screen.findByTestId('person-settle');
    expect(settleBtn).toHaveAttribute('href', '/t/t-dl/pay/dl-t');

    const manageLink = screen.getByRole('link', {
      name: 'Rename or merge in Đà Lạt',
    });
    expect(manageLink).toHaveAttribute('href', '/t/t-dl/people');
  });
});
