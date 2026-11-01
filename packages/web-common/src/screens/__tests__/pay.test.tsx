import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PayInfo, PaymentView, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import { PayScreen } from '../PayScreen';
import { BankDetails } from '../BankDetails';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const payRoute = { route: `/t/t-1/pay/${PIDS.M}`, path: '/t/:tripId/pay/:toId' };

function payInfo(overrides: Partial<PayInfo> = {}): PayInfo {
  return {
    to: { id: PIDS.M, name: 'Minh' },
    amount: 1245000,
    bankState: 'ok',
    bank: { bin: '970407', bankName: 'Techcombank', accountNumber: '19031234565678', accountNumberMasked: '1903 •••• 5678', holderName: 'NGUYEN VAN MINH' },
    refCode: 'DALAT C7K2',
    payload: '00020101021238580010A000000727012800069704070114190312345656780208QRIBFTTA5303704540712450005802VN62140810DALAT C7K263046572',
    inFlight: [],
    ...overrides,
  };
}

function payment(status: PaymentView['status'], overrides: Partial<PaymentView> = {}): PaymentView {
  const amountClaimed = overrides.amountClaimed ?? 1245000;
  return {
    id: 'pay-1',
    fromId: PIDS.C,
    toId: PIDS.M,
    amountClaimed,
    amountConfirmed: status === 'confirmed' ? amountClaimed : null,
    status,
    notArrived: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const api = (info: PayInfo, extra: Record<string, unknown> = {}, view: TripView = guestChiView()) =>
  mockApi({ 'GET /api/trips/t-1': view, 'GET /api/trips/t-1/version': { version: 3 }, [`GET /api/trips/t-1/pay/${info.to.id}`]: info, ...extra });

/**
 * A server that moves on: `change` makes a new trip version with these payments and pay details, which the next poll
 * picks up. `post` answers the payment POST (set it per test).
 */
function liveServer(info: PayInfo, view: TripView = guestChiView()) {
  const server = {
    version: 3,
    payments: [] as PaymentView[],
    info,
    post: (() => Response.json({ paymentId: 'pay-1', status: 'says_paid' }, { status: 201 })) as () => Response | Promise<Response>,
  };
  const { calls } = mockApi({
    'GET /api/trips/t-1': () => Response.json({ ...view, trip: { ...view.trip, version: server.version }, payments: server.payments }),
    'GET /api/trips/t-1/version': () => Response.json({ version: server.version }),
    [`GET /api/trips/t-1/pay/${info.to.id}`]: () => Response.json(server.info),
    'POST /api/trips/t-1/payments': () => server.post(),
  });
  const change = (payments: PaymentView[], next: PayInfo) => {
    server.version += 1;
    server.payments = payments;
    server.info = next;
  };
  return { server, calls, change };
}

/** Pay details with one payment waiting for the member (nothing left to pay), and with everything settled. */
const waitingInfo = () => payInfo({ amount: 0, payload: null, inFlight: [payment('says_paid')] });
const settledInfo = () => payInfo({ amount: 0, payload: null });

const fakeClock = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'], shouldAdvanceTime: true });
const pollOnce = () => act(async () => { await vi.advanceTimersByTimeAsync(5000); });

/**
 * The payer records a payment: from then on the trip view lists it and the pay details show what is still owed,
 * as the server answers after the POST.
 */
function recordFlow({
  view = guestChiView(),
  before = payInfo(),
  after,
  recorded,
  postStatus,
}: {
  view?: TripView;
  before?: PayInfo;
  after: PayInfo;
  recorded: PaymentView;
  postStatus: 'says_paid' | 'confirmed';
}) {
  const state = { paid: false };
  return mockApi({
    'GET /api/trips/t-1': () => Response.json(state.paid ? { ...view, trip: { ...view.trip, version: 4 }, payments: [recorded] } : view),
    'GET /api/trips/t-1/version': { version: 3 },
    [`GET /api/trips/t-1/pay/${before.to.id}`]: () => Response.json(state.paid ? after : before),
    'POST /api/trips/t-1/payments': () => {
      state.paid = true;
      return Response.json({ paymentId: recorded.id, status: postStatus }, { status: 201 });
    },
  });
}

describe('PayScreen', () => {
  it('shows the amount, the VietQR code, the account and the note to keep', async () => {
    api(payInfo());
    renderAt(<PayScreen />, payRoute);
    const qr = await screen.findByRole('img', { name: /VietQR code to pay Minh/ });
    await waitFor(() => expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/));
    expect(screen.getByText('to NGUYEN VAN MINH · Techcombank')).toBeInTheDocument();
    expect(screen.getByText('1903 •••• 5678')).toBeInTheDocument();
    expect(screen.getByText('DALAT C7K2')).toBeInTheDocument();
    expect(screen.getByText('Keep this note unchanged so the payment can be matched.')).toBeInTheDocument();
    expect(screen.getByText("Scan the QR with your phone's banking app.")).toBeInTheDocument();
    // The amount, the account and the note each show once (the QR component adds no second copy).
    expect(screen.getAllByText('1.245.000₫')).toHaveLength(1);
    // Nothing has happened yet, so nothing is "waiting".
    expect(screen.queryByText(/^Waiting for/)).not.toBeInTheDocument();
    // "I've paid" and its hint sit in the bottom bar on a phone.
    const bar = document.querySelector<HTMLElement>('.fsl-bottom-bar')!;
    expect(within(bar).getByRole('button', { name: "I've paid" })).toBeInTheDocument();
    expect(within(bar).getByText('Tap after the money has left your account.')).toBeInTheDocument();
  });

  it('says "Pay Minh" only once', async () => {
    api(payInfo());
    renderAt(<PayScreen />, payRoute);
    await screen.findByText('DALAT C7K2');
    expect(screen.getAllByText('Pay Minh')).toHaveLength(1);
  });

  it('copies the whole account number and the note', async () => {
    const user = userEvent.setup();
    api(payInfo());
    renderAt(<PayScreen />, payRoute);
    await user.click(await screen.findByRole('button', { name: 'Copy account number' }));
    expect(await navigator.clipboard.readText()).toBe('19031234565678');
    await user.click(screen.getByRole('button', { name: 'Copy note' }));
    expect(await navigator.clipboard.readText()).toBe('DALAT C7K2');
  });

  it('bank details waiting for approval: no QR, the spec copy, and a way to remind', async () => {
    api(payInfo({ bankState: 'pending', bank: null, payload: null }));
    renderAt(<PayScreen />, payRoute);
    expect(await screen.findByText("Minh's bank details are waiting for approval")).toBeInTheDocument();
    expect(screen.queryByText('Ask them to add them, then come back.')).not.toBeInTheDocument(); // they did add them
    expect(screen.queryByRole('img', { name: /VietQR/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remind Minh' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
  });

  it('no bank details yet: says so and offers to remind them', async () => {
    api(payInfo({ bankState: 'none', bank: null, payload: null }));
    renderAt(<PayScreen />, payRoute);
    expect(await screen.findByText("Minh hasn't added bank details yet")).toBeInTheDocument();
    expect(screen.getByText('Ask them to add them, then come back.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /VietQR/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remind Minh' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
  });

  it('a member paying a guest without bank details can add them for the guest', async () => {
    const view = tripView({ suggestions: [{ fromId: PIDS.M, toId: PIDS.C, amount: 300000 }] });
    api(payInfo({ to: { id: PIDS.C, name: 'Chi' }, amount: 300000, bankState: 'none', bank: null, payload: null }), {}, view);
    renderAt(<PayScreen />, { route: `/t/t-1/pay/${PIDS.C}`, path: '/t/:tripId/pay/:toId' });
    expect(await screen.findByText("Chi hasn't added bank details yet")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add bank details for Chi' })).toHaveAttribute('href', '/t/t-1/people/p-chi/bank');
  });

  it('a guest paying someone without bank details only gets Remind', async () => {
    api(payInfo({ bankState: 'none', bank: null, payload: null }));
    renderAt(<PayScreen />, payRoute);
    await screen.findByText("Minh hasn't added bank details yet");
    expect(screen.queryByRole('link', { name: /^Add bank details for/ })).toBeNull();
  });

  it('nothing owed and nothing on the way: says so and goes back to the trip', async () => {
    api(payInfo({ amount: 0, payload: null }));
    renderAt(<PayScreen />, payRoute);
    expect(await screen.findByText("You don't owe Minh anything right now.")).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /VietQR/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
  });

  it('"I\'ve paid" records the payment and shows the status instead of the QR', async () => {
    const { calls } = recordFlow({
      before: payInfo(),
      after: payInfo({ amount: 0, payload: null, inFlight: [payment('says_paid')] }),
      recorded: payment('says_paid'),
      postStatus: 'says_paid',
    });
    renderAt(<PayScreen />, payRoute);
    await userEvent.click(await screen.findByRole('button', { name: "I've paid" }));
    expect(await screen.findByText('Payment sent · 1.245.000₫')).toBeInTheDocument();
    expect(screen.getByText('Waiting for Minh to confirm it arrived. This page updates by itself.')).toBeInTheDocument();
    expect(screen.getByText('DALAT C7K2')).toBeInTheDocument();
    expect(screen.getByText('Paid by mistake? Ask Minh to tap "Didn\'t arrive".')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to trip' })).toHaveAttribute('href', '/t/t-1');
    // Never a QR for nothing: no code, no 0₫, nothing left to press.
    expect(screen.queryByRole('img', { name: /VietQR/ })).not.toBeInTheDocument();
    expect(screen.queryByText('0₫')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ fromId: PIDS.C, toId: PIDS.M, amount: 1245000 });
  });

  it('turns into "Paid" once the member confirms', async () => {
    recordFlow({
      before: payInfo(),
      after: payInfo({ amount: 0, payload: null }),
      recorded: payment('confirmed'),
      postStatus: 'says_paid',
    });
    renderAt(<PayScreen />, payRoute);
    await userEvent.click(await screen.findByRole('button', { name: "I've paid" }));
    expect(await screen.findByText('Paid · 1.245.000₫ to Minh')).toBeInTheDocument();
    expect(screen.getByText('It counts straight away.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to trip' })).toBeInTheDocument();
    expect(screen.queryByText(/Payment sent/)).not.toBeInTheDocument();
    expect(screen.queryByText("You don't owe Minh anything right now.")).not.toBeInTheDocument();
  });

  it('a member payer sees it counted straight away', async () => {
    const minhPaysAn = { ...tripView(), me: { kind: 'member' as const, participantId: PIDS.M, participantPending: false, isOrganiser: true } };
    const toAn = payInfo({ to: { id: PIDS.A, name: 'An' }, amount: 1245000 });
    const { calls } = recordFlow({
      view: minhPaysAn,
      before: toAn,
      after: { ...toAn, amount: 0, payload: null },
      recorded: payment('confirmed', { fromId: PIDS.M, toId: PIDS.A }),
      postStatus: 'confirmed',
    });
    renderAt(<PayScreen />, { route: `/t/t-1/pay/${PIDS.A}`, path: '/t/:tripId/pay/:toId' });
    await userEvent.click(await screen.findByRole('button', { name: "I've paid" }));
    expect(await screen.findByText('Paid · 1.245.000₫ to An')).toBeInTheDocument();
    expect(screen.queryByText(/Payment sent/)).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /VietQR/ })).not.toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ fromId: PIDS.M, toId: PIDS.A, amount: 1245000 });
  });

  it('a payment already on its way shows the status, not a QR', async () => {
    api(payInfo({ amount: 0, payload: null, inFlight: [payment('says_paid')] }));
    renderAt(<PayScreen />, payRoute);
    expect(await screen.findByText('Payment sent · 1.245.000₫')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /VietQR/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
  });

  it('a part payment says what is still owed and brings the QR back for the rest', async () => {
    api(payInfo({ amount: 245000, inFlight: [payment('says_paid', { amountClaimed: 1000000 })] }));
    renderAt(<PayScreen />, payRoute);
    expect(await screen.findByText('Payment sent · 1.000.000₫')).toBeInTheDocument();
    expect(screen.getByText('Still owed 245.000₫')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /VietQR/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show QR for the rest' }));
    expect(await screen.findByRole('img', { name: 'VietQR code to pay Minh 245.000₫' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "I've paid" })).toBeInTheDocument();
  });

  it('shows the sent card, then "Paid" when a poll sees the member confirm, and says so', async () => {
    fakeClock();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { server, change } = liveServer(payInfo());
    server.post = () => {
      change([payment('says_paid')], waitingInfo());
      return Response.json({ paymentId: 'pay-1', status: 'says_paid' }, { status: 201 });
    };
    renderAt(<PayScreen />, payRoute);
    await user.click(await screen.findByRole('button', { name: "I've paid" }));
    expect(await screen.findByText('Payment sent · 1.245.000₫')).toBeInTheDocument();
    const status = screen.getByTestId('pay-status');
    expect(status).toHaveTextContent('Payment sent · 1.245.000₫. Waiting for Minh to confirm it arrived.');

    change([payment('confirmed')], settledInfo());
    await pollOnce();
    expect(await screen.findByText('Paid · 1.245.000₫ to Minh')).toBeInTheDocument();
    // The same live region, so the change is spoken: it survives the loading state of the refetch in between.
    expect(screen.getByTestId('pay-status')).toBe(status);
    expect(status).toHaveTextContent('Paid · 1.245.000₫ to Minh. It counts straight away.');
    expect(screen.queryByText(/Payment sent/)).not.toBeInTheDocument();
  });

  it('a sent payment the member says did not arrive brings the QR back', async () => {
    fakeClock();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { server, change } = liveServer(payInfo());
    server.post = () => {
      change([payment('says_paid')], waitingInfo());
      return Response.json({ paymentId: 'pay-1', status: 'says_paid' }, { status: 201 });
    };
    renderAt(<PayScreen />, payRoute);
    await user.click(await screen.findByRole('button', { name: "I've paid" }));
    expect(await screen.findByText('Payment sent · 1.245.000₫')).toBeInTheDocument();

    change([payment('rejected')], payInfo());
    await pollOnce();
    expect(await screen.findByRole('img', { name: /VietQR code to pay Minh/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "I've paid" })).toBeInTheDocument();
    expect(screen.queryByText(/Payment sent/)).not.toBeInTheDocument();
    expect(screen.getByTestId('pay-status').textContent).toBe('');
  });

  it('records the rest, not the first amount, after "Show QR for the rest"', async () => {
    const { calls } = api(payInfo({ amount: 245000, inFlight: [payment('says_paid', { amountClaimed: 1000000 })] }), {
      'POST /api/trips/t-1/payments': () => Response.json({ paymentId: 'pay-2', status: 'says_paid' }, { status: 201 }),
    });
    renderAt(<PayScreen />, payRoute);
    await userEvent.click(await screen.findByRole('button', { name: 'Show QR for the rest' }));
    await userEvent.click(await screen.findByRole('button', { name: "I've paid" }));
    expect(await screen.findByText('Payment sent · 245.000₫')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ fromId: PIDS.C, toId: PIDS.M, amount: 245000 });
  });

  it('offers to check again on the status card after 10 minutes', async () => {
    fakeClock();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { calls } = api(waitingInfo());
    renderAt(<PayScreen />, payRoute);
    await screen.findByText('Payment sent · 1.245.000₫');
    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000 + 1);
    });
    const checkAgain = screen.getByRole('button', { name: 'Tap to check again' });
    const tripLoads = () => calls.filter((c) => c.method === 'GET' && c.path === '/api/trips/t-1').length;
    const before = tripLoads();
    await user.click(checkAgain);
    await waitFor(() => expect(tripLoads()).toBeGreaterThan(before));
    expect(screen.queryByRole('button', { name: 'Tap to check again' })).not.toBeInTheDocument();
  });

  it('disables "I\'ve paid" while the payment is being recorded', async () => {
    const { server, calls } = liveServer(payInfo());
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.post = async () => {
      await gate;
      return Response.json({ paymentId: 'pay-1', status: 'says_paid' }, { status: 201 });
    };
    renderAt(<PayScreen />, payRoute);
    const button = await screen.findByRole('button', { name: "I've paid" });
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button); // ignored
    release();
    expect(await screen.findByText('Payment sent · 1.245.000₫')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('a failed "I\'ve paid" says so next to the button, and tries again', async () => {
    const { server, calls, change } = liveServer(payInfo());
    let attempt = 0;
    server.post = () => {
      attempt += 1;
      if (attempt === 1) return Response.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 });
      change([payment('says_paid')], waitingInfo());
      return Response.json({ paymentId: 'pay-1', status: 'says_paid' }, { status: 201 });
    };
    renderAt(<PayScreen />, payRoute);
    await userEvent.click(await screen.findByRole('button', { name: "I've paid" }));
    // On a phone the button lives in the fixed bottom bar, so the error must be in the bar too (not below the fold).
    const bar = document.querySelector<HTMLElement>('.fsl-bottom-bar')!;
    const alert = await within(bar).findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Try again.');
    expect(within(bar).getByRole('button', { name: "I've paid" })).toBeEnabled();
    expect(screen.queryByText(/Payment sent/)).not.toBeInTheDocument();

    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Payment sent · 1.245.000₫')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  it('offers the bank app only on phones', async () => {
    api(payInfo());
    const mouse = renderAt(<PayScreen />, payRoute);
    await screen.findByText('DALAT C7K2');
    expect(screen.queryByRole('button', { name: 'Open bank app' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save QR' })).toBeInTheDocument();
    mouse.unmount();

    mockMedia({ coarse: true });
    renderAt(<PayScreen />, payRoute);
    expect(await screen.findByRole('button', { name: 'Open bank app' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save QR' })).toBeInTheDocument();
    expect(screen.queryByText("Scan the QR with your phone's banking app.")).not.toBeInTheDocument();
  });

  it('on a wide screen the buttons sit beside the QR instead of in a bottom bar', async () => {
    mockMedia({ wide: true });
    api(payInfo());
    renderAt(<PayScreen />, payRoute);
    expect(await screen.findByRole('button', { name: "I've paid" })).toBeInTheDocument();
    // The QR image arrives after the button: it is drawn asynchronously.
    expect(await screen.findByRole('img', { name: /VietQR code to pay Minh/ })).toBeInTheDocument();
    expect(screen.getByText('Tap after the money has left your account.')).toBeInTheDocument();
    expect(document.querySelector('.fsl-bottom-bar')).toBeNull();
  });

  it('an archived trip shows the details but offers no "I\'ve paid"', async () => {
    const view = guestChiView();
    api(payInfo(), {}, { ...view, trip: { ...view.trip, archived: true } });
    renderAt(<PayScreen />, payRoute);
    expect(await screen.findByRole('img', { name: /VietQR code to pay Minh/ })).toBeInTheDocument();
    expect(screen.getByText('DALAT C7K2')).toBeInTheDocument();
    expect(screen.getByText('This trip is archived. You can still look at it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
    expect(screen.queryByText('Tap after the money has left your account.')).not.toBeInTheDocument();
    expect(document.querySelector('.fsl-bottom-bar')).toBeNull();
  });

  it('lists bank apps that open with the VietQR deeplink', async () => {
    mockMedia({ coarse: true });
    api(payInfo());
    renderAt(<PayScreen />, payRoute);
    await userEvent.click(await screen.findByRole('button', { name: 'Open bank app' }));
    expect(await screen.findByRole('link', { name: /Vietcombank/ })).toHaveAttribute('href', 'https://dl.vietqr.io/pay?app=vcb');
  });

  it('stops checking after 10 minutes and offers to check again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    api(payInfo());
    renderAt(<PayScreen />, payRoute);
    await screen.findByText('DALAT C7K2');
    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000 + 1);
    });
    expect(screen.getByRole('button', { name: 'Tap to check again' })).toBeInTheDocument();
  });
});

describe('BankDetails', () => {
  const route = { route: '/t/t-1/bank', path: '/t/:tripId/bank' };

  it('writes the holder name the way banks show it, and needs consent', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': guestChiView(), 'PUT /api/trips/t-1/bank': null });
    renderAt(<BankDetails />, route);
    expect(await screen.findByText('A member approves new bank details before anyone can pay you.')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Bank'));
    await userEvent.type(screen.getByPlaceholderText('Search banks'), 'quan doi');
    await userEvent.click(screen.getAllByRole('option', { name: /^MBBank/ })[0]!);
    await userEvent.type(screen.getByLabelText('Account number'), '0123456789');
    const holder = screen.getByLabelText('Account holder name');
    await userEvent.type(holder, 'Nguyễn Văn Minh');
    await userEvent.tab();
    expect(holder).toHaveValue('NGUYEN VAN MINH');
    const save = screen.getByRole('button', { name: 'Save bank details' });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'I agree to the privacy notice' }));
    await userEvent.click(save);
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ bin: '970422', accountNumber: '0123456789', holderName: 'NGUYEN VAN MINH', consent: true }));
  });

  it('a guest whose details are approved gets no form: only a member changes them', async () => {
    const v = guestChiView();
    const account = { bankName: 'VPBank', accountNumberMasked: '0123 •••• 6789', holderName: 'TRAN THI CHI' };
    mockApi({ 'GET /api/trips/t-1': { ...v, people: v.people.map((p) => (p.id === PIDS.C ? { ...p, bank: 'approved' as const, bankAccount: account } : p)) } });
    renderAt(<BankDetails />, route);
    expect(await screen.findByText('Only a member can change them')).toBeInTheDocument();
    expect(screen.getByText('VPBank · 0123 •••• 6789')).toBeInTheDocument();
    expect(screen.queryByLabelText('Account number')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save bank details' })).toBeNull();
  });

  it('a guest whose name waits gets no form yet', async () => {
    const v = guestChiView();
    mockApi({ 'GET /api/trips/t-1': { ...v, me: { ...v.me, participantPending: true } } });
    renderAt(<BankDetails />, route);
    expect(await screen.findByText('You can add them once a member approves your name.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Account number')).toBeNull();
  });
});
