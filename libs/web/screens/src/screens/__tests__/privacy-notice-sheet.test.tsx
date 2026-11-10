import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import { BankDetails } from '../BankDetails';
import { GuestBank } from '../GuestBank';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function fillBank() {
  await userEvent.click(await screen.findByLabelText('Bank'));
  await userEvent.type(screen.getByPlaceholderText('Search banks'), 'vpbank');
  await userEvent.click(screen.getAllByRole('option', { name: /^VPBank/ })[0]!);
  await userEvent.type(screen.getByLabelText('Account number'), '0123456789');
  await userEvent.type(screen.getByLabelText('Account holder name'), 'Tran Thi Chi');
  await userEvent.tab();
}

/** Opens the privacy notice from the consent row, checks it shows, and closes it again. */
async function readPrivacyNotice() {
  await userEvent.click(screen.getByRole('button', { name: 'privacy notice' }));
  expect(await screen.findByRole('dialog', { name: 'Privacy notice' })).toBeInTheDocument();
  expect(screen.getByText(/1\. Who runs the service/i)).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('privacy notice from a bank form (#90)', () => {
  it('BankDetails keeps the typed details and consent after reading the notice', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': guestChiView(), 'PUT /api/trips/t-1/bank': null });
    renderAt(<BankDetails />, { route: '/t/t-1/bank', path: '/t/:tripId/bank' });
    await fillBank();
    const consent = screen.getByRole('checkbox', { name: 'I agree to the privacy notice' });
    await userEvent.click(consent);

    await readPrivacyNotice();

    // Opening the notice neither left the screen nor ticked/unticked the checkbox.
    expect(screen.getByLabelText('Account number')).toHaveValue('0123456789');
    expect(screen.getByLabelText('Account holder name')).toHaveValue('TRAN THI CHI');
    expect(screen.getByRole('checkbox', { name: 'I agree to the privacy notice' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Save bank details' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ bin: '970432', accountNumber: '0123456789', holderName: 'TRAN THI CHI', consent: true }),
    );
  });

  it('opening the notice does not tick the consent box', async () => {
    mockApi({ 'GET /api/trips/t-1': guestChiView() });
    renderAt(<BankDetails />, { route: '/t/t-1/bank', path: '/t/:tripId/bank' });
    await screen.findByLabelText('Account number');
    await readPrivacyNotice();
    expect(screen.getByRole('checkbox', { name: 'I agree to the privacy notice' })).not.toBeChecked();
  });

  it('GuestBank stays in Change mode with the typed details after reading the notice', async () => {
    const v: TripView = tripView();
    const account = { bankName: 'VPBank', accountNumberMasked: '0123 •••• 6789', holderName: 'TRAN THI CHI' };
    mockApi({
      'GET /api/trips/t-1': { ...v, people: v.people.map((p) => (p.id === PIDS.C ? { ...p, bank: 'approved' as const, bankAccount: account } : p)) },
    });
    renderAt(<GuestBank />, { route: `/t/t-1/people/${PIDS.C}/bank`, path: '/t/:tripId/people/:pid/bank' });
    await userEvent.click(await screen.findByRole('button', { name: 'Change' }));
    await fillBank();
    const name = 'Chi agreed to share these details. See the privacy notice';
    await userEvent.click(screen.getByRole('checkbox', { name }));

    await readPrivacyNotice();

    expect(screen.getByLabelText('Account number')).toHaveValue('0123456789');
    expect(screen.getByLabelText('Account holder name')).toHaveValue('TRAN THI CHI');
    expect(screen.getByRole('checkbox', { name })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
