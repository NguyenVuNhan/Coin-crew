import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PayInfo } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, PIDS } from '../../test/fixtures';
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

const api = (info: PayInfo, extra: Record<string, unknown> = {}) =>
  mockApi({ 'GET /api/trips/t-1': guestChiView(), 'GET /api/trips/t-1/version': { version: 3 }, [`GET /api/trips/t-1/pay/${PIDS.M}`]: info, ...extra });

describe('PayScreen', () => {
  it('shows the VietQR code, the bank details and the note to keep', async () => {
    api(payInfo());
    renderAt(<PayScreen />, payRoute);
    const qr = await screen.findByRole('img', { name: /VietQR code to pay Minh/ });
    await waitFor(() => expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/));
    expect(screen.getByText('DALAT C7K2')).toBeInTheDocument();
    expect(screen.getByText('1903 •••• 5678')).toBeInTheDocument();
    expect(screen.getByText('NGUYEN VAN MINH')).toBeInTheDocument();
    expect(screen.getByText('Keep this note unchanged so the payment can be matched.')).toBeInTheDocument();
    expect(screen.getByText('Waiting for the money to reach Minh. This page updates by itself.')).toBeInTheDocument();
  });

  it('bank details waiting for approval: no QR, the spec copy', async () => {
    api(payInfo({ bankState: 'pending', bank: null, payload: null }));
    renderAt(<PayScreen />, payRoute);
    expect(await screen.findByText("Minh's bank details are waiting for approval")).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /VietQR/ })).not.toBeInTheDocument();
  });

  it('no bank details yet: says so', async () => {
    api(payInfo({ bankState: 'none', bank: null, payload: null }));
    renderAt(<PayScreen />, payRoute);
    expect(await screen.findByText("Minh hasn't added bank details yet")).toBeInTheDocument();
  });

  it('"I\'ve already paid" records the payment and waits for the member', async () => {
    const { calls } = api(payInfo(), {
      'POST /api/trips/t-1/payments': () => Response.json({ paymentId: 'pay-1', status: 'says_paid' }, { status: 201 }),
    });
    renderAt(<PayScreen />, payRoute);
    await userEvent.click(await screen.findByRole('button', { name: "I've already paid" }));
    expect(await screen.findByText('Waiting for Minh to confirm')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ fromId: PIDS.C, toId: PIDS.M, amount: 1245000 });
  });

  it('lists bank apps that open with the VietQR deeplink', async () => {
    api(payInfo());
    renderAt(<PayScreen />, payRoute);
    await userEvent.click(await screen.findByRole('button', { name: 'Open my bank app' }));
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
