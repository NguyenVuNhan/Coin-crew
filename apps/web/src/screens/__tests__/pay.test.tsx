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
    expect(screen.queryByRole('img', { name: /VietQR/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remind Minh' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
  });

  it('no bank details yet: says so and offers to remind them', async () => {
    api(payInfo({ bankState: 'none', bank: null, payload: null }));
    renderAt(<PayScreen />, payRoute);
    expect(await screen.findByText("Minh hasn't added bank details yet")).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /VietQR/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remind Minh' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "I've paid" })).not.toBeInTheDocument();
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
  });

  it('on a wide screen the buttons sit beside the QR instead of in a bottom bar', async () => {
    mockMedia({ wide: true });
    api(payInfo());
    renderAt(<PayScreen />, payRoute);
    expect(await screen.findByRole('button', { name: "I've paid" })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /VietQR code to pay Minh/ })).toBeInTheDocument();
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
    await userEvent.selectOptions(screen.getByLabelText('Bank'), '970422');
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
});
