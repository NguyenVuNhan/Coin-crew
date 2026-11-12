import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { PIDS, guestChiView, tripView } from '../../test/fixtures';
import { App } from '../../App';

// Owner, 2026-11-12: a guest (not signed in) only reaches their pay pages. Seeing the group takes signing in; back on a
// pay page goes to the name picker.
afterEach(() => {
  vi.unstubAllGlobals();
});

const link = { tripId: 't-1', tripName: 'Đà Lạt · Oct 2026', access: 'group' };

const payInfo = {
  to: { id: PIDS.M, name: 'Minh' },
  amount: 1245000,
  bankState: 'ok' as const,
  bank: { bin: '970407', bankName: 'Techcombank', accountNumber: '19031234565678', accountNumberMasked: '1903 •••• 5678', holderName: 'NGUYEN VAN MINH' },
  refCode: 'DALAT C7K2',
  payload: '00020101021238580010A000000727012800069704070114190312345656780208QRIBFTTA5303704540712450005802VN62140810DALAT C7K263046572',
  inFlight: [],
};

function guestApi(view = guestChiView()) {
  return mockApi({
    'GET /api/links/gtok-1': link,
    'GET /api/trips/t-1': view,
    'GET /api/trips/t-1/version': { version: 3 },
    [`GET /api/trips/t-1/pay/${PIDS.M}`]: payInfo,
    [`GET /api/trips/t-1/pay/${PIDS.B}`]: { ...payInfo, to: { id: PIDS.B, name: 'Bình' } },
  });
}

const twoDebts = {
  ...guestChiView(),
  suggestions: [
    { fromId: PIDS.C, toId: PIDS.M, amount: 1000000 },
    { fromId: PIDS.C, toId: PIDS.B, amount: 245000 },
  ],
};

describe('a guest only reaches their pay pages', () => {
  it('the group link opens what they owe, not the group', async () => {
    guestApi(twoDebts);
    renderAt(<App />, { route: '/j/gtok-1' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/j/gtok-1/owe'));
    expect(document.querySelector('.fsl-guest')).toBeNull();
  });

  it('other group pages send a guest to what they owe', async () => {
    for (const path of ['/j/gtok-1/expenses/new', '/j/gtok-1/people', '/j/gtok-1/activity', '/j/gtok-1/settings']) {
      guestApi(twoDebts);
      const { unmount } = renderAt(<App />, { route: path });
      await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/j/gtok-1/owe'));
      unmount();
    }
  });

  it('a pay page stays open', async () => {
    guestApi();
    renderAt(<App />, { route: `/j/gtok-1/pay/${PIDS.M}` });
    expect(await screen.findByText('DALAT C7K2')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(`/j/gtok-1/pay/${PIDS.M}`);
  });

  it('what they owe: back goes to the name picker and sign-in replaces See the group', async () => {
    guestApi(twoDebts);
    renderAt(<App />, { route: '/j/gtok-1/owe' });
    expect(await screen.findByRole('link', { name: 'Pay Minh' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/j/gtok-1/who');
    expect(screen.queryByRole('link', { name: 'See the group' })).toBeNull();
    expect(screen.getByText('Log in to see the group')).toBeInTheDocument();
    expect(document.querySelector('.fsl-guest-signin')).not.toBeNull();
    // One quiet button in place of "See the group"; the sign-in choices open in a sheet (one primary per view).
    expect(screen.queryByRole('link', { name: /Sign in with Google/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('a pay page: back goes to the name picker and sign-in replaces See the group', async () => {
    guestApi();
    renderAt(<App />, { route: `/j/gtok-1/pay/${PIDS.M}?via=owe` });
    expect(await screen.findByText('DALAT C7K2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/j/gtok-1/who');
    expect(screen.queryByRole('link', { name: 'See the group' })).toBeNull();
    expect(screen.getByText('Log in to see the group')).toBeInTheDocument();
  });

  it('a signed-in guest is offered to join the group, not to sign in again', async () => {
    mockApi({
      'GET /api/me': { user: { id: 'u-1', name: 'Chi' }, signIn: { google: true, zalo: true } },
      'GET /api/links/gtok-1': link,
      'GET /api/trips/t-1': twoDebts,
      'GET /api/trips/t-1/version': { version: 3 },
    });
    renderAt(<App />, { route: '/j/gtok-1/owe' });
    const join = await screen.findByRole('link', { name: 'Join the group' });
    expect(join).toHaveAttribute('href', '/j/gtok-1/who');
    expect(screen.getByText('Join the group to see it')).toBeInTheDocument();
  });

  it('a guest who asked to join sees that a member will approve it', async () => {
    mockApi({
      'GET /api/me': { user: { id: 'u-1', name: 'Chi' }, signIn: { google: true, zalo: true } },
      'GET /api/links/gtok-1': link,
      'GET /api/trips/t-1': { ...twoDebts, me: { ...twoDebts.me, hasPendingMembershipRequest: true } },
      'GET /api/trips/t-1/version': { version: 3 },
    });
    renderAt(<App />, { route: '/j/gtok-1/owe' });
    expect(await screen.findByText('You asked to become a member. A member will approve it.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Join the group' })).toBeNull();
  });

  it('a member is not sent anywhere', async () => {
    mockApi({
      'GET /api/trips/t-1': tripView(),
      'GET /api/trips/t-1/version': { version: 3 },
    });
    renderAt(<App />, { route: '/t/t-1/people' });
    await screen.findAllByText('Minh');
    expect(screen.getByTestId('location')).toHaveTextContent('/t/t-1/people');
  });
});
