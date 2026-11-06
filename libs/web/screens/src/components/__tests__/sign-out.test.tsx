import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';
import { sessionStore } from '@cc/web-platform/session';
import { AccountMenu } from '../AccountMenu';

const user = { name: 'Chi', email: 'chi@example.com' };

afterEach(() => {
  sessionStore.reset();
  localStorage.clear();
  vi.unstubAllGlobals();
});

/** A Zalo Mini App phone where Chi is signed in, with a saved group link. */
async function chiInZalo() {
  const p = fakePlatform();
  p.store.set('sessionToken', 'sess-chi');
  p.store.set('deviceId', 'z_chi');
  p.store.set('zaloName', 'Chi');
  await sessionStore.init(p);
  localStorage.setItem('lt:t-1', 'gtok-1');
  return p;
}

async function signOutFromMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Account' }));
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Account' })).getByRole('button', { name: 'Sign out' }));
}

describe('Signing out', () => {
  it('signing out forgets this phone', async () => {
    const p = await chiInZalo();
    const { calls } = mockApi({ 'POST /api/auth/logout': null });
    renderAt(<AccountMenu user={user} />, { route: '/groups', path: '/groups', platform: p });
    await signOutFromMenu();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/auth/logout')).toBe(true);
    expect(p.store.has('sessionToken')).toBe(false);
    expect(p.store.has('deviceId')).toBe(false);
    expect(p.store.has('zaloName')).toBe(false);
    expect(p.store.get('signedOut')).toBe('1');
    expect(sessionStore.token()).toBeNull();
    expect(sessionStore.deviceId()).toBeNull();
    expect(localStorage.getItem('lt:t-1')).toBeNull();
  });

  it('a failed sign-out forgets nothing and shows the error', async () => {
    const p = await chiInZalo();
    mockApi({ 'POST /api/auth/logout': () => Response.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 }) });
    renderAt(<AccountMenu user={user} />, { route: '/groups', path: '/groups', platform: p });
    await signOutFromMenu();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(p.store.get('sessionToken')).toBe('sess-chi');
    expect(p.store.has('signedOut')).toBe(false);
    expect(localStorage.getItem('lt:t-1')).toBe('gtok-1');
    expect(screen.getByTestId('location')).toHaveTextContent('/groups');
  });

  it('on the web, sign-out leaves no signed-out mark', async () => {
    const p = fakePlatform({ kind: 'web', apiBase: '' });
    await sessionStore.init(p);
    mockApi({ 'POST /api/auth/logout': null });
    renderAt(<AccountMenu user={user} />, { route: '/groups', path: '/groups', platform: p });
    await signOutFromMenu();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(p.store.has('signedOut')).toBe(false);
  });
});
