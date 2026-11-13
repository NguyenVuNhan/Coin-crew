import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { PayInfo, RequestView } from '@cc/core';
import { mockApi, renderAt } from '../../test/render';
import { mockMedia } from '../../test/media';
import { RequestPage } from '../RequestPage';

// Owner, 2026-11-12: the request page (/r/:token) and the group pay page share one layout — QR, Open bank, Download
// QR, account and transfer note with copy buttons, "What this covers", then the sticky "I've paid".
const pay: PayInfo = {
  to: { id: 'led-o', name: 'Nhan' },
  amount: 120000,
  bankState: 'ok',
  bank: { bin: '970436', bankName: 'Vietcombank', accountNumber: '0123456789', accountNumberMasked: '••••6789', holderName: 'NGUYEN NHAN' },
  refCode: 'FSL1',
  payload: '000201...',
  inFlight: [],
};

const view: RequestView = {
  ownerName: 'Nhan',
  total: 120000,
  settled: false,
  settlementWaiting: false,
  items: [{ tripId: 't-direct', tripName: '', kind: 'direct', amount: 120000, oldestOpenAt: '2026-10-30T10:00:00Z' }],
  pay,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the request page shares the pay page layout', () => {
  it('shows the account number and the transfer note with copy buttons, and the keep-note line', async () => {
    mockMedia({});
    mockApi({ 'GET /api/r/tok': view });
    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });
    const rows = await screen.findByText('FSL1').then((el) => el.closest('.fsl-pay__rows') as HTMLElement);
    expect(rows).not.toBeNull();
    expect(within(rows).getByText('••••6789')).toBeInTheDocument();
    expect(within(rows).getByRole('button', { name: 'Copy account number' })).toBeInTheDocument();
    expect(within(rows).getByRole('button', { name: 'Copy note' })).toBeInTheDocument();
    expect(screen.getByText('Keep this note unchanged so the payment can be matched.')).toBeInTheDocument();
  });

  it("on a phone, I've paid sits in the sticky bar and What this covers stays in the page", async () => {
    mockMedia({});
    mockApi({ 'GET /api/r/tok': view });
    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });
    const paid = await screen.findByTestId('request-paid');
    expect(paid.closest('.fsl-bottom-bar')).not.toBeNull();
    expect(screen.getByTestId('request-covers').closest('.fsl-bottom-bar')).toBeNull();
    expect(screen.getByTestId('request-covers').closest('.fsl-pay__body')).not.toBeNull();
  });

  it("on a wide screen, I've paid sits in the page under the details", async () => {
    mockMedia({ wide: true });
    mockApi({ 'GET /api/r/tok': view });
    renderAt(<RequestPage />, { route: '/r/tok', path: '/r/:token' });
    const paid = await screen.findByTestId('request-paid');
    expect(paid.closest('.fsl-bottom-bar')).toBeNull();
    expect(paid.closest('.fsl-pay__body')).not.toBeNull();
  });
});
