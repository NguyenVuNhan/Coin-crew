import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LedgerCardInput } from '@cc/web-util/ledgerCard';
import { mockApi, renderAt } from '../../test/render';
import { mockMedia } from '../../test/media';
import { tripView, PIDS } from '../../test/fixtures';
import { BalanceCard } from '../BalanceCard';

const rendered: LedgerCardInput[] = [];
vi.mock('@cc/web-util/ledgerCard', () => ({
  renderLedgerPng: vi.fn(async (input: LedgerCardInput) => {
    rendered.push(input);
    return new Blob(['png'], { type: 'image/png' });
  }),
}));

const PAYLOAD = '00020101021138580010A000000727012800069704070114190312345656780208QRIBFTTA53037045802VN6304ABCD';

function payInfo(bankState: 'ok' | 'pending' | 'none') {
  return {
    to: { id: PIDS.M, name: 'Minh' },
    amount: 0,
    bankState,
    bank: bankState === 'ok' ? { bin: '970407', bankName: 'Techcombank', accountNumber: '1903', accountNumberMasked: '••03', holderName: 'NGUYEN MINH' } : null,
    refCode: '',
    payload: bankState === 'ok' ? PAYLOAD : null,
    inFlight: [],
  };
}

function phoneShare() {
  const share = vi.fn(async (_data: ShareData) => undefined);
  vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mobile Safari', share, canShare: () => true });
  return share;
}

afterEach(() => {
  rendered.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Request payment on the balance card', () => {
  it('shows when people owe me', async () => {
    mockMedia({});
    mockApi({ [`GET /api/trips/t-1/pay/${PIDS.M}`]: payInfo('ok') });
    renderAt(<BalanceCard view={tripView()} />, { route: '/t/t-1', path: '/t/:tripId' });
    const button = await screen.findByRole('button', { name: /Request payment/ });
    expect(button.className).toContain('fsl-balance__request');
  });

  it('is hidden when nobody sends me money', () => {
    mockMedia({});
    mockApi({});
    renderAt(<BalanceCard view={tripView({ suggestions: [] })} />, { route: '/t/t-1', path: '/t/:tripId' });
    expect(document.querySelector('.fsl-balance__request')).toBeNull();
  });

  it('is hidden on an archived group and for a viewer', () => {
    mockMedia({});
    mockApi({});
    const v = tripView();
    renderAt(<BalanceCard view={{ ...v, trip: { ...v.trip, archived: true } }} />, { route: '/t/t-1', path: '/t/:tripId' });
    expect(document.querySelector('.fsl-balance__request')).toBeNull();
    renderAt(<BalanceCard view={{ ...v, me: { ...v.me, kind: 'viewer' } }} />, { route: '/t/t-1', path: '/t/:tripId' });
    expect(document.querySelector('.fsl-balance__request')).toBeNull();
  });

  it('shows with transfers into me even when my net is not positive', async () => {
    mockMedia({});
    mockApi({ [`GET /api/trips/t-1/pay/${PIDS.M}`]: payInfo('ok') });
    const v = tripView({
      suggestions: [
        { fromId: PIDS.A, toId: PIDS.M, amount: 100000 },
        { fromId: PIDS.M, toId: PIDS.B, amount: 100000 },
      ],
      myBalance: { now: 0, beforePayments: 0, ifPendingApproved: null, waitingConfirm: 0 },
    });
    renderAt(<BalanceCard view={v} />, { route: '/t/t-1', path: '/t/:tripId' });
    expect(await screen.findByRole('button', { name: /Request payment/ })).toBeInTheDocument();
  });

  it('phone share sends the picture rows and the owe link', async () => {
    mockMedia({});
    mockApi({ [`GET /api/trips/t-1/pay/${PIDS.M}`]: payInfo('ok') });
    const share = phoneShare();
    renderAt(<BalanceCard view={tripView()} />, { route: '/t/t-1', path: '/t/:tripId' });
    const button = await screen.findByRole('button', { name: /Request payment/ });
    // Wait for the QR, so the picture carries it.
    await waitFor(() => expect(button.getAttribute('data-qr-ready')).toBe('true'));
    await userEvent.click(button);
    await waitFor(() => expect(share).toHaveBeenCalled());
    const input = rendered[0]!;
    expect(input.rows.map((r) => [r.name, r.amount])).toEqual([
      ['Chi', 1245000],
      ['Bình', 565000],
      ['An', 385000],
    ]);
    expect(input.total).toBe(2195000);
    expect(input.qrSvg).toBeTruthy();
    expect(input.bankLine).toBe('Minh · Techcombank · 1903 · NGUYEN MINH');
    expect(share.mock.calls[0]![0].text).toContain('/j/gtok-1/owe');
  });

  it('no bank details opens the bank-first sheet', async () => {
    mockMedia({});
    mockApi({ [`GET /api/trips/t-1/pay/${PIDS.M}`]: payInfo('none') });
    const share = phoneShare();
    const v = tripView();
    const view = { ...v, people: v.people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'none' as const } : p)) };
    renderAt(<BalanceCard view={view} />, { route: '/t/t-1', path: '/t/:tripId' });
    await userEvent.click(await screen.findByRole('button', { name: /Request payment/ }));
    await waitFor(() => expect(document.querySelector('.fsl-bank-first')).not.toBeNull());
    expect(share).not.toHaveBeenCalled();
  });

  it('pending bank details share without QR', async () => {
    mockMedia({});
    mockApi({ [`GET /api/trips/t-1/pay/${PIDS.M}`]: payInfo('pending') });
    const share = phoneShare();
    const v = tripView();
    const view = { ...v, people: v.people.map((p) => (p.id === PIDS.M ? { ...p, bank: 'pending' as const } : p)) };
    renderAt(<BalanceCard view={view} />, { route: '/t/t-1', path: '/t/:tripId' });
    const button = await screen.findByRole('button', { name: /Request payment/ });
    await waitFor(() => expect(button.getAttribute('data-qr-ready')).toBe('true'));
    await userEvent.click(button);
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(rendered[0]!.qrSvg).toBeUndefined();
    expect(rendered[0]!.bankLine).toBeUndefined();
  });
});
