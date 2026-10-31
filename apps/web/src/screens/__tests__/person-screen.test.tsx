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
  linked: [],
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
    expect(within(screen.getByTestId('person-item-t-led')).getByText('Quick expenses')).toBeInTheDocument();
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
            body: { paid: 270000, direction: 'toOwner', idempotencyKey: expect.stringMatching(/^[A-Za-z0-9_-]{16,64}$/) },
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

  it('a guest: person-settle opens the pay sheet (not a group pay link) and a Rename or merge link goes to /t/t-dl/people', async () => {
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
      linked: [],
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
    expect(settleBtn).not.toHaveAttribute('href');

    const manageLink = screen.getByRole('link', {
      name: 'Rename or merge in Đà Lạt',
    });
    expect(manageLink).toHaveAttribute('href', '/t/t-dl/people');
  });

  it('paid in cash: Save is disabled while sending and one key is reused for a retry', async () => {
    let resolve: (r: Response) => void = () => {};
    const { calls } = mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [minh] },
      'POST /api/me/people/u%3Au-minh/settle': () => new Promise<Response>((r) => { resolve = r; }),
    });
    renderAt(<PersonScreen />, { route: '/people/u%3Au-minh', path: '/people/:key' });

    await userEvent.click(await screen.findByTestId('person-cash'));
    const saveBtn = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveBtn);
    await waitFor(() => expect(saveBtn).toBeDisabled());
    await userEvent.click(saveBtn);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    resolve(Response.json({ settlementId: 's-2', status: 'confirmed' }, { status: 201 }));
  });

  it('paid in cash: an error is shown in the sheet', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [minh] },
      'POST /api/me/people/u%3Au-minh/settle': () =>
        Response.json({ error: { code: 'VALIDATION', message: 'Too many groups to settle at once.' } }, { status: 422 }),
    });
    renderAt(<PersonScreen />, { route: '/people/u%3Au-minh', path: '/people/:key' });
    await userEvent.click(await screen.findByTestId('person-cash'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('not received: posts POST /api/me/settlements/s-1/reject', async () => {
    const { calls } = mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [minh] },
      'POST /api/me/settlements/s-1/reject': null,
    });
    renderAt(<PersonScreen />, { route: '/people/u%3Au-minh', path: '/people/:key' });
    const row = await screen.findByTestId('waiting-s-1');
    await userEvent.click(within(row).getByRole('button', { name: 'Not received' }));
    await waitFor(() => {
      expect(calls).toEqual(expect.arrayContaining([expect.objectContaining({ method: 'POST', path: '/api/me/settlements/s-1/reject' })]));
    });
  });

  it('confirm: a failure is shown on the row instead of being lost', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [minh] },
      'POST /api/me/settlements/s-1/confirm': () =>
        Response.json({ error: { code: 'ALREADY_HANDLED', message: 'Someone already handled this.' } }, { status: 409 }),
    });
    renderAt(<PersonScreen />, { route: '/people/u%3Au-minh', path: '/people/:key' });
    const row = await screen.findByTestId('waiting-s-1');
    await userEvent.click(within(row).getByRole('button', { name: 'Confirm' }));
    expect(await within(await screen.findByTestId('waiting-s-1')).findByRole('alert')).toBeInTheDocument();
  });

  it('two linked guests in one trip render both rows', async () => {
    const twice: PersonSummary = {
      ...minh,
      waiting: [],
      items: [
        { tripId: 't-dl', tripName: 'Đà Lạt', kind: 'group', amount: 50000, oldestOpenAt: '2026-10-01T00:00:00.000Z', ownerPid: 'dl-o', otherPid: 'dl-a' },
        { tripId: 't-dl', tripName: 'Đà Lạt', kind: 'group', amount: 30000, oldestOpenAt: '2026-10-02T00:00:00.000Z', ownerPid: 'dl-o', otherPid: 'dl-b' },
      ],
      total: 80000,
    };
    mockApi({ 'GET /api/me': me(), 'GET /api/me/people/summary': { incomplete: false, people: [twice] } });
    renderAt(<PersonScreen />, { route: '/people/u%3Au-minh', path: '/people/:key' });
    await screen.findByTestId('person-request');
    expect(screen.getAllByTestId('person-item-t-dl')).toHaveLength(2);
  });

  describe('settle up when I owe', () => {
    const owed: PersonSummary = {
      ...minh,
      total: -200000,
      waiting: [],
      items: [
        { tripId: 't-bad', tripName: 'Badminton', kind: 'group', amount: -300000, oldestOpenAt: '2026-10-02T00:00:00.000Z', ownerPid: 'b-o', otherPid: 'b-m' },
        { tripId: 't-led', tripName: 'Minh', kind: 'direct', amount: 100000, oldestOpenAt: '2026-10-01T00:00:00.000Z', ownerPid: 'led-o', otherPid: 'led-m' },
      ],
    };
    const pay = {
      to: { id: 'b-m', name: 'Minh' },
      amount: 200000,
      bankState: 'ok',
      bank: { bin: '970407', bankName: 'Techcombank', accountNumber: '19031234565678', accountNumberMasked: '•••• 5678', holderName: 'NGUYEN MINH' },
      refCode: 'CC-AB12',
      payload: '00020101021238570010A000000727012700069704070113190312345656780208QRIBFTTA5303704540620000058Vn',
      inFlight: [],
    };

    it('shows the netted amount and the QR, and "I\'ve paid them" settles the netted total from me', async () => {
      const { calls } = mockApi({
        'GET /api/me': me(),
        'GET /api/me/people/summary': { incomplete: false, people: [owed] },
        'GET /api/me/people/u%3Au-minh/pay': pay,
        'POST /api/me/people/u%3Au-minh/settle': { settlementId: 's-3', status: 'confirmed' },
      });
      renderAt(<PersonScreen />, { route: '/people/u%3Au-minh', path: '/people/:key' });

      await userEvent.click(await screen.findByTestId('person-settle'));
      const sheet = await screen.findByTestId('person-pay-sheet');
      expect(sheet).toHaveTextContent('200.000');
      expect(await within(sheet).findByRole('img')).toBeInTheDocument();

      await userEvent.click(within(sheet).getByTestId('person-paid-them'));
      await waitFor(() => {
        expect(calls).toEqual(expect.arrayContaining([
          expect.objectContaining({
            method: 'POST',
            path: '/api/me/people/u%3Au-minh/settle',
            body: { paid: 200000, direction: 'fromOwner', idempotencyKey: expect.stringMatching(/^[A-Za-z0-9_-]{16,64}$/) },
          }),
        ]));
      });
    });

    it('without bank details it says so and still offers "I\'ve paid them"', async () => {
      mockApi({
        'GET /api/me': me(),
        'GET /api/me/people/summary': { incomplete: false, people: [owed] },
        'GET /api/me/people/u%3Au-minh/pay': { ...pay, bankState: 'none', bank: null, payload: null },
      });
      renderAt(<PersonScreen />, { route: '/people/u%3Au-minh', path: '/people/:key' });
      await userEvent.click(await screen.findByTestId('person-settle'));
      expect(await screen.findByTestId('person-pay-nobank')).toHaveTextContent("Minh hasn't added bank details yet");
      expect(screen.getByTestId('person-paid-them')).toBeEnabled();
    });
  });
});
