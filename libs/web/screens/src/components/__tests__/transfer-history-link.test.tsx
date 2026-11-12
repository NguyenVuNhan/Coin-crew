import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PayInfo } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import { YourTransfers } from '../YourTransfers';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const PAYLOAD = '00020101021238580010A000000727012800069704070114190312345656780208QRIBFTTA5303704540712450005802VN62140810DALAT C7K263046572';
const BANK = { bin: '970407', bankName: 'Techcombank', accountNumber: '19031234565678', accountNumberMasked: '1903 •••• 5678', holderName: 'NGUYEN VAN MINH' };
const payInfo: PayInfo = { to: { id: PIDS.M, name: 'Minh' }, amount: 565000, bankState: 'ok', bank: BANK, refCode: 'DALAT C7K2', payload: PAYLOAD, inFlight: [] };
const ME_USER = { id: 'u-1', email: 'minh@example.com', name: 'Minh', avatarUrl: null, zaloName: null };

describe('Your transfers: history link', () => {
  it('member signed in, I owe: open row shows "See history with Minh" → /people/in/t-1/p-minh', async () => {
    mockApi({
      'GET /api/me': { user: ME_USER, signIn: { zalo: false }, mergeRequests: { incoming: [], outgoing: [], joining: [], claim: null } },
      'GET /api/trips/t-1/pay/p-minh': payInfo,
    });
    const view = tripView({ me: { kind: 'member', participantId: PIDS.C, participantPending: false, isOrganiser: false } });
    renderAt(<YourTransfers view={view} />);
    await userEvent.click(screen.getByRole('button', { name: /^You → Minh/ }));
    const link = await screen.findByTestId('transfer-history');
    expect(link).toHaveTextContent('See history with Minh');
    expect(link).toHaveAttribute('href', '/people/in/t-1/p-minh');
  });

  it('guest: no transfer-history button', async () => {
    mockApi({
      'GET /api/me': { user: null, signIn: { zalo: false }, mergeRequests: { incoming: [], outgoing: [], joining: [], claim: null } },
      'GET /api/trips/t-1/pay/p-minh': payInfo,
    });
    renderAt(<YourTransfers view={guestChiView()} />);
    await userEvent.click(screen.getByRole('button', { name: /^You → Minh/ }));
    await screen.findByRole('img', { name: /VietQR code/ });
    expect(screen.queryByTestId('transfer-history')).toBeNull();
  });
});
