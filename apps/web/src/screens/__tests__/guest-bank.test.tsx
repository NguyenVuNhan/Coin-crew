import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PersonView, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import { GuestBank } from '../GuestBank';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const route = (pid: string = PIDS.C) => ({ route: `/t/t-1/people/${pid}/bank`, path: '/t/:tripId/people/:pid/bank' });
const account = { bankName: 'VPBank', accountNumberMasked: '0123 •••• 6789', holderName: 'TRAN THI CHI' };

/** Minh's member view, with Chi's bank details as given. */
function withChi(bank: PersonView['bank'], bankAccount?: PersonView['bankAccount'], extra: Partial<TripView> = {}): TripView {
  const v = tripView(extra);
  return { ...v, people: v.people.map((p) => (p.id === PIDS.C ? { ...p, bank, ...(bankAccount ? { bankAccount } : {}) } : p)) };
}

async function fillChiBank() {
  await userEvent.selectOptions(await screen.findByLabelText('Bank'), '970432');
  await userEvent.type(screen.getByLabelText('Account number'), '0123456789');
  await userEvent.type(screen.getByLabelText('Account holder name'), 'Tran Thi Chi');
  await userEvent.tab();
}

describe('GuestBank', () => {
  it('with no details, a member adds them with the guest\'s consent', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': withChi('none'), 'PUT /api/trips/t-1/people/p-chi/bank': null });
    renderAt(<GuestBank />, route());
    expect(await screen.findByRole('heading', { name: "Chi's bank details" })).toBeInTheDocument();
    expect(screen.getByText('Details you save count straight away. Only add details Chi gave you.')).toBeInTheDocument();
    await fillChiBank();
    const save = screen.getByRole('button', { name: 'Save bank details' });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Chi agreed to share these details. See the privacy notice' }));
    await userEvent.click(save);
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')).toEqual({
        method: 'PUT',
        path: '/api/trips/t-1/people/p-chi/bank',
        body: { bin: '970432', accountNumber: '0123456789', holderName: 'TRAN THI CHI', consent: true },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/t/t-1/people');
  });

  it('shows the details there are, with Change and Delete', async () => {
    mockApi({ 'GET /api/trips/t-1': withChi('approved', account) });
    renderAt(<GuestBank />, route());
    expect(await screen.findByText('VPBank · 0123 •••• 6789')).toBeInTheDocument();
    expect(screen.getByText('TRAN THI CHI')).toBeInTheDocument();
    expect(screen.queryByLabelText('Account number')).toBeNull();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByText('Waiting for a member to approve.')).toBeNull();
  });

  it('says when the details still wait for approval', async () => {
    mockApi({ 'GET /api/trips/t-1': withChi('pending', account) });
    renderAt(<GuestBank />, route());
    expect(await screen.findByText('Waiting for a member to approve.')).toBeInTheDocument();
  });

  it('Change opens the form, and Cancel goes back to the details', async () => {
    const { calls } = mockApi({ 'GET /api/trips/t-1': withChi('approved', account), 'PUT /api/trips/t-1/people/p-chi/bank': null });
    renderAt(<GuestBank />, route());
    await userEvent.click(await screen.findByRole('button', { name: 'Change' }));
    expect(screen.getByLabelText('Account number')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('VPBank · 0123 •••• 6789')).toBeInTheDocument();
    expect(screen.queryByLabelText('Account number')).toBeNull();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('Delete asks first and then deletes', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { calls } = mockApi({ 'GET /api/trips/t-1': withChi('approved', account), 'DELETE /api/trips/t-1/people/p-chi/bank': null });
    renderAt(<GuestBank />, route());
    const del = await screen.findByRole('button', { name: 'Delete' });
    await userEvent.click(del);
    expect(confirm).toHaveBeenCalledWith("Delete Chi's bank details? Nobody can pay Chi by QR until new ones are added.");
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await userEvent.click(del);
    await waitFor(() => expect(calls.find((c) => c.method === 'DELETE')?.path).toBe('/api/trips/t-1/people/p-chi/bank'));
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted');
  });

  it('a refused save or delete shows the error and keeps the screen', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const refuse = () => Response.json({ error: { code: 'FORBIDDEN', message: 'Not allowed' } }, { status: 403 });
    mockApi({ 'GET /api/trips/t-1': withChi('approved', account), 'DELETE /api/trips/t-1/people/p-chi/bank': refuse });
    renderAt(<GuestBank />, route());
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('VPBank · 0123 •••• 6789')).toBeInTheDocument();
  });

  it('an archived trip shows the details without Change or Delete', async () => {
    const v = withChi('approved', account);
    mockApi({ 'GET /api/trips/t-1': { ...v, trip: { ...v.trip, archived: true } } });
    renderAt(<GuestBank />, route());
    expect(await screen.findByText('VPBank · 0123 •••• 6789')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('sends a guest, or a member opened for another member, back to the trip', async () => {
    mockApi({ 'GET /api/trips/t-1': guestChiView() });
    const guest = renderAt(<GuestBank />, route());
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
    guest.unmount();

    mockApi({ 'GET /api/trips/t-1': withChi('none') });
    renderAt(<GuestBank />, route(PIDS.M));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/t\/t-1$/));
  });

  it('shows a skeleton while loading and an error with retry when the trip fails', async () => {
    mockApi({ 'GET /api/trips/t-1': () => Response.json({ error: { code: 'INTERNAL', message: 'Boom' } }, { status: 500 }) });
    renderAt(<GuestBank />, route());
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
