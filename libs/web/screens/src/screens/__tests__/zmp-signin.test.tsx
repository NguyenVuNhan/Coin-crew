import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt, mockApi } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';
import { picker, PIDS } from '../../test/fixtures';
import { sessionStore } from '@cc/web-platform/session';
import { Landing } from '../Landing';
import { WhoAreYou } from '../WhoAreYou';

afterEach(() => {
  sessionStore.reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const signedOut = { user: null, signIn: { zalo: true } };
const whoRoute = { route: '/t/t-1/who', path: '/t/:tripId/who' };
/** Nobody picked on this phone yet, so nothing is pre-selected by the picker itself. */
const freshPicker = () =>
  picker({ myPick: null, people: picker().people.map((p) => ({ ...p, lastUsedHere: false })) });

describe('Zalo Mini App sign-in', () => {
  it('Landing on zmp offers only Zalo, with the Google warning', async () => {
    mockApi({ 'GET /api/me': signedOut });
    const platform = fakePlatform();
    renderAt(<Landing />, { platform });
    expect(await screen.findByRole('button', { name: 'Continue with your Zalo account' })).toBeInTheDocument();
    expect(screen.getByText('Already use CoinCrew with Google? Link Zalo on the web first.')).toBeInTheDocument();
    expect(screen.queryByText('Sign in with Google')).toBeNull();
    expect(screen.queryByRole('link', { name: /Sign in with/ })).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'api.test' }));
    expect(platform.calls.openExternal).toEqual([['https://api.test']]);
  });

  it('declining the Zalo profile shows the note and sends no POST', async () => {
    const { calls } = mockApi({ 'GET /api/me': signedOut });
    renderAt(<Landing />, { platform: fakePlatform({ zaloUserInfo: async () => 'declined' }) });
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with your Zalo account' }));
    const note = await screen.findByText('We need your Zalo name and photo to create your account.');
    expect(note).toHaveClass('fsl-zalo-signin__declined');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(screen.getByRole('button', { name: 'Continue with your Zalo account' })).toBeEnabled();
  });

  it('granting the Zalo profile posts consent and the profile', async () => {
    const { calls } = mockApi({
      'GET /api/me': signedOut,
      'POST /api/auth/zalo-mini': { status: 'signed_in', sessionToken: 'sess-1' },
    });
    renderAt(<Landing />, { platform: fakePlatform() });
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with your Zalo account' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === '/api/auth/zalo-mini')?.body).toEqual({
        accessToken: 'zalo-token',
        consent: true,
        profile: { name: 'An', avatar: 'https://avatar.test/an.png' },
      }),
    );
  });

  it('a failed sign-in shows the generic error', async () => {
    mockApi({
      'GET /api/me': signedOut,
      'POST /api/auth/zalo-mini': () =>
        Response.json({ error: { code: 'ZALO_TOKEN_INVALID', message: 'bad' } }, { status: 401 }),
    });
    renderAt(<Landing />, { platform: fakePlatform() });
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with your Zalo account' }));
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
  });
});

describe('WhoAreYou in the Zalo Mini App', () => {
  it('suggests the Zalo name and "Continue as An" picks An', async () => {
    const { calls } = mockApi({
      'GET /api/me': signedOut,
      'GET /api/trips/t-1/people/picker': freshPicker(),
      'POST /api/trips/t-1/people/pick': null,
    });
    const platform = fakePlatform();
    platform.store.set('zaloName', 'An');
    const { container } = renderAt(<WhoAreYou />, { ...whoRoute, platform });

    expect(await screen.findByText('Are you An?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with your Zalo account' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^An/ })).toHaveAttribute('aria-checked', 'true');

    const banner = container.querySelector('.fsl-who__zalo-match') as HTMLElement;
    await userEvent.click(within(banner).getByRole('button', { name: 'Continue as An' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === '/api/trips/t-1/people/pick')?.body).toEqual({ participantId: PIDS.A }),
    );
  });

  it('no Zalo name, no banner', async () => {
    mockApi({ 'GET /api/me': signedOut, 'GET /api/trips/t-1/people/picker': freshPicker() });
    const { container } = renderAt(<WhoAreYou />, { ...whoRoute, platform: fakePlatform() });
    await screen.findByRole('radiogroup');
    expect(screen.getByRole('button', { name: 'Continue with your Zalo account' })).toBeInTheDocument();
    expect(container.querySelector('.fsl-who__zalo-match')).toBeNull();
  });

  it('on the web there is no banner and no Zalo button', async () => {
    mockApi({ 'GET /api/me': signedOut, 'GET /api/trips/t-1/people/picker': freshPicker() });
    localStorage.setItem('zaloName', 'An');
    try {
      const { container } = renderAt(<WhoAreYou />, whoRoute);
      await screen.findByRole('radiogroup');
      expect(container.querySelector('.fsl-who__zalo-match')).toBeNull();
      expect(screen.queryByText('Are you An?')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Continue with your Zalo account' })).toBeNull();
      expect(container.querySelector('.fsl-zalo-signin')).toBeNull();
    } finally {
      localStorage.removeItem('zaloName');
    }
  });
});
