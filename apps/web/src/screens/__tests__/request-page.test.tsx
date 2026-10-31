import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PayInfo, RequestView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { RequestPage } from '../RequestPage';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const payFixture: PayInfo = {
  to: { id: 'led-o', name: 'Nhan' },
  amount: 120000,
  bankState: 'ok',
  bank: {
    bin: '970436',
    bankName: 'Vietcombank',
    accountNumber: '0123456789',
    accountNumberMasked: '••••6789',
    holderName: 'NGUYEN NHAN',
  },
  refCode: 'FSL1',
  payload: '000201...',
  inFlight: [],
};

describe('RequestPage (/r/:token)', () => {
  it('1. One item (direct, 120000) -> request-single, text "Nhan asked you for", "120.000" visible, request-paid present, cash hint present', async () => {
    const view: RequestView = {
      ownerName: 'Nhan',
      total: 120000,
      settled: false,
      settlementWaiting: false,
      items: [
        {
          tripId: 't-direct',
          tripName: '',
          kind: 'direct',
          amount: 120000,
          oldestOpenAt: '2026-10-30T10:00:00Z',
        },
      ],
      pay: payFixture,
    };

    mockApi({
      'GET /api/r/tok': view,
    });

    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    expect(await screen.findByTestId('request-single')).toBeInTheDocument();
    expect(screen.getByText('Nhan asked you for')).toBeInTheDocument();
    expect(screen.getByText(/120\.000/)).toBeInTheDocument();
    expect(screen.getByTestId('request-paid')).toBeInTheDocument();
    expect(
      screen.getByText('Paid in cash? Tell Nhan, they’ll mark it.'),
    ).toBeInTheDocument();
  });

  it('2. Two items (direct 370000, group "Badminton" -100000), total 270000 -> request-netted, "You owe Nhan", request-item rows for both, "Badminton" visible', async () => {
    const view: RequestView = {
      ownerName: 'Nhan',
      total: 270000,
      settled: false,
      settlementWaiting: false,
      items: [
        {
          tripId: 't-direct',
          tripName: '',
          kind: 'direct',
          amount: 370000,
          oldestOpenAt: '2026-10-29T10:00:00Z',
        },
        {
          tripId: 't-badminton',
          tripName: 'Badminton',
          kind: 'group',
          amount: -100000,
          oldestOpenAt: '2026-10-30T10:00:00Z',
        },
      ],
      pay: { ...payFixture, amount: 270000 },
    };

    mockApi({
      'GET /api/r/tok': view,
    });

    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    expect(await screen.findByTestId('request-netted')).toBeInTheDocument();
    expect(screen.getByText('You owe Nhan')).toBeInTheDocument();
    expect(screen.getByTestId('request-item-t-direct')).toBeInTheDocument();
    expect(screen.getByTestId('request-item-t-badminton')).toBeInTheDocument();
    expect(screen.getByText('Badminton')).toBeInTheDocument();
    expect(screen.getByText(/270\.000/)).toBeInTheDocument();
  });

  it('3. settled: true, items [], total 0 -> "You’re all settled with Nhan" and no request-paid', async () => {
    const view: RequestView = {
      ownerName: 'Nhan',
      total: 0,
      settled: true,
      settlementWaiting: false,
      items: [],
      pay: null,
    };

    mockApi({
      'GET /api/r/tok': view,
    });

    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    expect(
      await screen.findByText('You’re all settled with Nhan'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('request-paid')).toBeNull();
  });

  it('4. pay: null with one item -> "Nhan hasn’t added bank details — pay them directly." and request-paid still present', async () => {
    const view: RequestView = {
      ownerName: 'Nhan',
      total: 120000,
      settled: false,
      settlementWaiting: false,
      items: [
        {
          tripId: 't-direct',
          tripName: '',
          kind: 'direct',
          amount: 120000,
          oldestOpenAt: '2026-10-30T10:00:00Z',
        },
      ],
      pay: null,
    };

    mockApi({
      'GET /api/r/tok': view,
    });

    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    expect(
      await screen.findByText(
        'Nhan hasn’t added bank details — pay them directly.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('request-paid')).toBeInTheDocument();
  });

  it('5. Tapping request-paid posts POST /api/r/tok/paid with { amount: 120000 } and then request-waiting shows "Waiting for Nhan to confirm"', async () => {
    const user = userEvent.setup();
    const view: RequestView = {
      ownerName: 'Nhan',
      total: 120000,
      settled: false,
      settlementWaiting: false,
      items: [
        {
          tripId: 't-direct',
          tripName: '',
          kind: 'direct',
          amount: 120000,
          oldestOpenAt: '2026-10-30T10:00:00Z',
        },
      ],
      pay: payFixture,
    };

    const { calls } = mockApi({
      'GET /api/r/tok': view,
      'POST /api/r/tok/paid': () =>
        Response.json(
          { settlementId: 's-1', status: 'says_paid' },
          { status: 201 },
        ),
    });

    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    const paidBtn = await screen.findByTestId('request-paid');
    await user.click(paidBtn);

    const waitingCard = await screen.findByTestId('request-waiting');
    expect(waitingCard).toHaveTextContent('Waiting for Nhan to confirm');
    expect(screen.queryByTestId('request-paid')).toBeNull();

    const postCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/r/tok/paid',
    );
    expect(postCall).toBeDefined();
    expect(postCall?.body).toEqual({ amount: 120000 });
  });

  it('6. TRY_AGAIN: the POST handler returns 409 TRY_AGAIN the first time and 201 the second; after tapping, request-waiting appears and POST was called twice', async () => {
    const user = userEvent.setup();
    let postCount = 0;
    const view: RequestView = {
      ownerName: 'Nhan',
      total: 120000,
      settled: false,
      settlementWaiting: false,
      items: [
        {
          tripId: 't-direct',
          tripName: '',
          kind: 'direct',
          amount: 120000,
          oldestOpenAt: '2026-10-30T10:00:00Z',
        },
      ],
      pay: payFixture,
    };

    mockApi({
      'GET /api/r/tok': view,
      'POST /api/r/tok/paid': () => {
        postCount++;
        if (postCount === 1) {
          return Response.json(
            { error: { code: 'TRY_AGAIN', message: 'x' } },
            { status: 409 },
          );
        }
        return Response.json(
          { settlementId: 's-1', status: 'says_paid' },
          { status: 201 },
        );
      },
    });

    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    const paidBtn = await screen.findByTestId('request-paid');
    await user.click(paidBtn);

    await waitFor(
      () => {
        expect(screen.getByTestId('request-waiting')).toHaveTextContent(
          'Waiting for Nhan to confirm',
        );
      },
      { timeout: 4000 },
    );

    expect(postCount).toBe(2);
  });

  it('7. No element with text matching /sign in/i is on the page in case 1', async () => {
    const view: RequestView = {
      ownerName: 'Nhan',
      total: 120000,
      settled: false,
      settlementWaiting: false,
      items: [
        {
          tripId: 't-direct',
          tripName: '',
          kind: 'direct',
          amount: 120000,
          oldestOpenAt: '2026-10-30T10:00:00Z',
        },
      ],
      pay: payFixture,
    };

    mockApi({
      'GET /api/r/tok': view,
    });

    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    await screen.findByTestId('request-single');

    expect(screen.queryByText(/sign in/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/sign in/i);
  });

  it('8. 404 response shows empty state with notFound copy', async () => {
    mockApi({
      'GET /api/r/tok': () =>
        Response.json(
          { error: { code: 'NOT_FOUND', message: 'Not found' } },
          { status: 404 },
        ),
    });

    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    expect(
      await screen.findByText(
        'This link no longer works. Ask for a new one.',
      ),
    ).toBeInTheDocument();
  });

  it('9. Other API errors show InlineError with retry', async () => {
    let attempts = 0;
    mockApi({
      'GET /api/r/tok': () => {
        attempts++;
        if (attempts === 1) {
          return Response.json(
            { error: { code: 'INTERNAL', message: 'Server error' } },
            { status: 500 },
          );
        }
        return Response.json({
          ownerName: 'Nhan',
          total: 120000,
          settled: false,
          settlementWaiting: false,
          items: [],
          pay: null,
        });
      },
    });

    const user = userEvent.setup();
    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    const retryBtn = await screen.findByRole('button', { name: 'Try again' });
    expect(retryBtn).toBeInTheDocument();

    await user.click(retryBtn);

    expect(
      await screen.findByText('Nhan asked you for'),
    ).toBeInTheDocument();
  });

  it('10. ALREADY_WAITING error immediately switches to waiting card', async () => {
    const user = userEvent.setup();
    const view: RequestView = {
      ownerName: 'Nhan',
      total: 120000,
      settled: false,
      settlementWaiting: false,
      items: [
        {
          tripId: 't-direct',
          tripName: '',
          kind: 'direct',
          amount: 120000,
          oldestOpenAt: '2026-10-30T10:00:00Z',
        },
      ],
      pay: payFixture,
    };

    mockApi({
      'GET /api/r/tok': view,
      'POST /api/r/tok/paid': () =>
        Response.json(
          { error: { code: 'ALREADY_WAITING', message: 'already waiting' } },
          { status: 409 },
        ),
    });

    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    const paidBtn = await screen.findByTestId('request-paid');
    await user.click(paidBtn);

    const waitingCard = await screen.findByTestId('request-waiting');
    expect(waitingCard).toHaveTextContent('Waiting for Nhan to confirm');
  });

  it('11. Owner owes friend (total < 0) shows ownerOwes heading, Amount with tone="success", and item list with no QR or paid button', async () => {
    const view: RequestView = {
      ownerName: 'Nhan',
      total: -150000,
      settled: false,
      settlementWaiting: false,
      items: [
        {
          tripId: 't-direct',
          tripName: '',
          kind: 'direct',
          amount: -150000,
          oldestOpenAt: '2026-10-30T10:00:00Z',
        },
      ],
      pay: null,
    };

    mockApi({
      'GET /api/r/tok': view,
    });

    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });

    expect(await screen.findByText('Nhan owes you')).toBeInTheDocument();
    expect(screen.getByText(/150\.000/)).toBeInTheDocument();
    expect(screen.getByTestId('request-item-t-direct')).toBeInTheDocument();
    expect(screen.queryByTestId('request-paid')).toBeNull();
  });
});
