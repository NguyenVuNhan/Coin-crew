import { describe, it, expect, afterEach, vi, type MockInstance } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthProvider, MeResponse, OutgoingMergeRequest } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { useMe } from '../../api/hooks';
import { LinkedAccounts } from '../LinkedAccounts';

const ZALO_UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Zalo/12.0';

let uaSpy: MockInstance | undefined;

afterEach(() => {
  uaSpy?.mockRestore();
  uaSpy = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function me(
  providers: AuthProvider[],
  outgoing: OutgoingMergeRequest[] = [],
  email = 'minh@example.com',
): MeResponse {
  return {
    user: {
      id: 'u1',
      email: providers.includes('google') ? email : null,
      name: 'Minh',
      consentAt: null,
      providers,
    },
    signIn: { zalo: true },
    mergeRequests: {
      incoming: [],
      outgoing,
    },
  };
}

function Harness() {
  const q = useMe();
  return q.data ? <LinkedAccounts me={q.data} /> : null;
}

describe('LinkedAccounts', () => {
  it('shows both providers with their state', async () => {
    mockApi({ 'GET /api/me': me(['google']) });
    renderAt(<Harness />, { route: '/trips' });

    const googleRow = await screen.findByTestId('method-google');
    const zaloRow = screen.getByTestId('method-zalo');

    expect(screen.getByRole('heading', { name: 'Sign-in methods' })).toBeInTheDocument();

    expect(googleRow).toHaveTextContent('Google');
    expect(googleRow).toHaveTextContent('minh@example.com');
    const googleChange = within(googleRow).getByRole('link', { name: 'Change' });
    expect(googleChange).toHaveAttribute('href', '/api/auth/google/start?returnTo=%2Ftrips&intent=link');
    // Google is the only method, so there is nothing to unlink yet.
    expect(within(googleRow).queryByRole('button', { name: 'Unlink' })).toBeNull();

    expect(zaloRow).toHaveTextContent('Zalo');
    expect(zaloRow).toHaveTextContent('Not linked');
    const zaloLink = within(zaloRow).getByRole('link', { name: 'Link' });
    expect(zaloLink).toHaveAttribute('href', '/api/auth/zalo/start?returnTo=%2Ftrips&intent=link');
  });

  it('a lone method has no Unlink, and the info button explains linking the other', async () => {
    const user = userEvent.setup();
    mockApi({ 'GET /api/me': me(['google']) });
    const { unmount } = renderAt(<Harness />, { route: '/trips' });

    const googleRow = await screen.findByTestId('method-google');
    expect(within(googleRow).queryByRole('button', { name: 'Unlink' })).toBeNull();
    expect(screen.queryByText('Link another way to sign in first')).toBeNull();
    expect(screen.queryByText('Link Zalo too so you can sign in from the Zalo app')).toBeNull();
    const whyZalo = within(screen.getByTestId('method-zalo')).getByRole('button', { name: 'Why link it?' });
    await user.click(whyZalo);
    expect(whyZalo).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Link Zalo too so you can sign in from the Zalo app')).toBeInTheDocument();
    unmount();

    mockApi({ 'GET /api/me': me(['zalo']) });
    renderAt(<Harness />, { route: '/trips' });

    const zaloRow = await screen.findByTestId('method-zalo');
    expect(within(zaloRow).queryByRole('button', { name: 'Unlink' })).toBeNull();
    await user.click(within(screen.getByTestId('method-google')).getByRole('button', { name: 'Why link it?' }));
    expect(
      screen.getByText("Link Google too so you don't lose this account if your Zalo changes"),
    ).toBeInTheDocument();
  });

  it('unlinks after confirming', async () => {
    const user = userEvent.setup();
    let meState = me(['google', 'zalo']);
    const { calls } = mockApi({
      'GET /api/me': () => Response.json(meState),
      'DELETE /api/me/identities/zalo': () => {
        meState = me(['google']);
        return new Response(null, { status: 204 });
      },
    });

    renderAt(<Harness />, { route: '/trips' });

    const zaloRow = await screen.findByTestId('method-zalo');
    const unlinkBtn = within(zaloRow).getByRole('button', { name: 'Unlink' });
    expect(unlinkBtn).toBeEnabled();
    await user.click(unlinkBtn);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Unlink Zalo? You will sign in with the other method.');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    const confirmBtn = within(dialog).getByRole('button', { name: 'Unlink' });
    await user.click(confirmBtn);

    await waitFor(() => {
      const deleteCall = calls.find(
        (c) => c.method === 'DELETE' && c.path === '/api/me/identities/zalo',
      );
      expect(deleteCall).toBeDefined();
      const meCalls = calls.filter((c) => c.method === 'GET' && c.path === '/api/me');
      expect(meCalls.length).toBeGreaterThanOrEqual(2);
    });

    await waitFor(() => {
      expect(screen.getByTestId('method-zalo')).toHaveTextContent('Not linked');
    });
  });

  it('the unlink icon is a visible rose icon on a white button, not rose on rose', async () => {
    mockApi({ 'GET /api/me': me(['google', 'zalo']) });
    renderAt(<Harness />, { route: '/trips' });
    const zaloRow = await screen.findByTestId('method-zalo');
    const unlink = within(zaloRow).getByRole('button', { name: 'Unlink' });
    expect(unlink).toHaveClass('bg-card', 'text-danger');
    expect(unlink).not.toHaveClass('bg-destructive');
  });

  it('shows a refused unlink', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me': me(['google', 'zalo']),
      'DELETE /api/me/identities/zalo': () =>
        Response.json({ error: { code: 'LAST_IDENTITY', message: 'x' } }, { status: 409 }),
    });

    renderAt(<Harness />, { route: '/trips' });

    const zaloRow = await screen.findByTestId('method-zalo');
    const unlinkBtn = within(zaloRow).getByRole('button', { name: 'Unlink' });
    await user.click(unlinkBtn);

    const dialog = await screen.findByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: 'Unlink' });
    await user.click(confirmBtn);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Link another way to sign in first.');
  });

  it('inside Zalo, linking Google shows the browser hint', async () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ZALO_UA);
    mockApi({ 'GET /api/me': me(['zalo']) });
    renderAt(<Harness />, { route: '/trips' });

    const googleRow = await screen.findByTestId('method-google');
    expect(within(googleRow).queryByRole('link', { name: 'Link' })).toBeNull();
    expect(within(googleRow).queryByRole('link', { name: 'Change' })).toBeNull();
    expect(
      within(googleRow).getByText(
        'Used Google before? Tap ⋯ → Open in browser to sign in with Google, then link Zalo in the account menu.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the outgoing request as a chip and cancels it from the sheet', async () => {
    const user = userEvent.setup();
    const outgoingReq: OutgoingMergeRequest = {
      id: 'm-1',
      provider: 'zalo',
      status: 'pending',
      expiresAt: '2026-10-28T00:00:00.000Z',
      otherName: 'Noah Nguyen',
      identityLabel: 'Noah Zalo',
    };
    let meState = me(['google'], [outgoingReq]);
    const { calls } = mockApi({
      'GET /api/me': () => Response.json(meState),
      'POST /api/me/merge-requests/m-1/cancel': () => {
        meState = me(['google'], []);
        return new Response(null, { status: 204 });
      },
    });

    renderAt(<Harness />, { route: '/trips' });

    const zaloCard = await screen.findByRole('button', {
      name: 'Zalo: Waiting to confirm, Noah Nguyen. See details',
    });
    await user.click(zaloCard);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent("Merge with Noah Nguyen's account");
    await user.click(within(dialog).getByRole('button', { name: 'Cancel request' }));

    await waitFor(() => {
      const cancelCall = calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/merge-requests/m-1/cancel',
      );
      expect(cancelCall).toBeDefined();
      const meCalls = calls.filter((c) => c.method === 'GET' && c.path === '/api/me');
      expect(meCalls.length).toBeGreaterThanOrEqual(2);
    });

    await waitFor(() => {
      expect(screen.queryByText('Waiting to confirm')).toBeNull();
      expect(screen.getByTestId('method-zalo')).toHaveTextContent('Not linked');
    });
  });

  it('shows finished requests as chips', async () => {
    const declinedReq: OutgoingMergeRequest = {
      id: 'm-1',
      provider: 'zalo',
      status: 'declined',
      expiresAt: '2026-10-28T00:00:00.000Z',
    };
    mockApi({
      'GET /api/me': me(['google'], [declinedReq]),
    });
    const { unmount } = renderAt(<Harness />, { route: '/trips' });
    expect(within(await screen.findByTestId('method-zalo')).getByText('Declined')).toBeInTheDocument();
    unmount();

    const acceptedReq: OutgoingMergeRequest = {
      id: 'm-2',
      provider: 'zalo',
      status: 'accepted',
      expiresAt: '2026-10-28T00:00:00.000Z',
    };
    mockApi({
      'GET /api/me': me(['google'], [acceptedReq]),
    });
    renderAt(<Harness />, { route: '/trips' });
    expect(within(await screen.findByTestId('method-zalo')).getByText('Merged')).toBeInTheDocument();
  });
});
