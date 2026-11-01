import { describe, it, expect, afterEach, vi, type MockInstance } from 'vitest';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthProvider, MeResponse, OutgoingMergeRequest } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { useMe } from '../../api/hooks';
import { signInHref } from '../SignInButtons';
import { MergeSheet } from '../MergeSheet';

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
  providers: AuthProvider[] = ['google'],
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

function makeRequest(overrides: Partial<OutgoingMergeRequest> = {}): OutgoingMergeRequest {
  return {
    id: 'mr-1',
    provider: 'zalo',
    status: 'pending',
    expiresAt: '2026-11-02T18:00:00.000Z',
    otherName: 'Noah Nguyen',
    identityLabel: 'Noah Zalo',
    ...overrides,
  };
}

function MeObserver() {
  useMe();
  return null;
}

describe('MergeSheet', () => {
  it('renders pending state with step 2 active, expiry, sign-in link, switch note, and cancel button', async () => {
    const request = makeRequest({ status: 'pending' });
    mockApi({ 'GET /api/me': me(['google'], [request]) });

    renderAt(
      <>
        <MeObserver />
        <MergeSheet request={request} open onClose={vi.fn()} />
      </>,
      { route: '/trips' },
    );

    const dialog = screen.getByRole('dialog', { name: "Merge with Noah Nguyen's account" });
    expect(dialog).toBeInTheDocument();

    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[1]).toHaveTextContent('Expires 03/11');

    const link = screen.getByRole('link', { name: 'Sign in with Zalo to confirm' });
    expect(link).toHaveAttribute(
      'href',
      '/api/auth/zalo/start?returnTo=%2Fgroups%3FmergeReview%3Dmr-1',
    );

    expect(screen.getByText(/This device switches to Noah Nguyen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument();
  });

  it('renders declined state with declined message, got it button, and link again link', async () => {
    const request = makeRequest({ status: 'declined' });
    mockApi({ 'GET /api/me': me(['google'], [request]) });

    renderAt(
      <>
        <MeObserver />
        <MergeSheet request={request} open onClose={vi.fn()} />
      </>,
      { route: '/trips' },
    );

    expect(screen.getByText(/Noah Nguyen declined the merge/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
    const linkAgain = screen.getByRole('link', { name: 'Link again' });
    expect(linkAgain).toHaveAttribute('href', signInHref('zalo', '/trips', 'link'));
  });

  it('renders accepted state with no aria-current, summary, got it button, and no cancel or link-again', async () => {
    const request = makeRequest({ status: 'accepted' });
    mockApi({ 'GET /api/me': me(['google'], [request]) });

    renderAt(
      <>
        <MeObserver />
        <MergeSheet request={request} open onClose={vi.fn()} />
      </>,
      { route: '/trips' },
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item).not.toHaveAttribute('aria-current');
    }

    expect(
      screen.getByText("Noah Nguyen's groups, bank details and history are now in this account."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Link again' })).toBeNull();
  });

  it('cancels pending request, invokes onClose, and refetches me', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const request = makeRequest({ status: 'pending' });
    let meState = me(['google'], [request]);

    const { calls } = mockApi({
      'GET /api/me': () => Response.json(meState),
      'POST /api/me/merge-requests/mr-1/cancel': () => {
        meState = me(['google'], []);
        return new Response(null, { status: 204 });
      },
    });

    renderAt(
      <>
        <MeObserver />
        <MergeSheet request={request} open onClose={onClose} />
      </>,
      { route: '/trips' },
    );

    const cancelBtn = await screen.findByRole('button', { name: 'Cancel request' });
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      const postIdx = calls.findIndex(
        (c) => c.method === 'POST' && c.path === '/api/me/merge-requests/mr-1/cancel',
      );
      expect(postIdx).toBeGreaterThanOrEqual(0);
      const subsequentGet = calls
        .slice(postIdx + 1)
        .some((c) => c.method === 'GET' && c.path === '/api/me');
      expect(subsequentGet).toBe(true);
      const meCalls = calls.filter((c) => c.method === 'GET' && c.path === '/api/me');
      expect(meCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('dismisses accepted request on Got it, invokes onClose, and refetches me', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const request = makeRequest({ status: 'accepted' });
    let meState = me(['google'], [request]);

    const { calls } = mockApi({
      'GET /api/me': () => Response.json(meState),
      'POST /api/me/merge-requests/mr-1/dismiss': () => {
        meState = me(['google'], []);
        return new Response(null, { status: 204 });
      },
    });

    renderAt(
      <>
        <MeObserver />
        <MergeSheet request={request} open onClose={onClose} />
      </>,
      { route: '/trips' },
    );

    const gotItBtn = await screen.findByRole('button', { name: 'Got it' });
    await user.click(gotItBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      const postIdx = calls.findIndex(
        (c) => c.method === 'POST' && c.path === '/api/me/merge-requests/mr-1/dismiss',
      );
      expect(postIdx).toBeGreaterThanOrEqual(0);
      const subsequentGet = calls
        .slice(postIdx + 1)
        .some((c) => c.method === 'GET' && c.path === '/api/me');
      expect(subsequentGet).toBe(true);
      const meCalls = calls.filter((c) => c.method === 'GET' && c.path === '/api/me');
      expect(meCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('gracefully handles 404 on cancel by calling onClose without an alert', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const request = makeRequest({ status: 'pending' });

    mockApi({
      'GET /api/me': me(['google'], [request]),
      'POST /api/me/merge-requests/mr-1/cancel': () =>
        Response.json({ error: { code: 'NOT_FOUND', message: 'x' } }, { status: 404 }),
    });

    renderAt(
      <>
        <MeObserver />
        <MergeSheet request={request} open onClose={onClose} />
      </>,
      { route: '/trips' },
    );

    const cancelBtn = await screen.findByRole('button', { name: 'Cancel request' });
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an alert and does not call onClose when dismiss fails with 500', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const request = makeRequest({ status: 'accepted' });

    mockApi({
      'GET /api/me': me(['google'], [request]),
      'POST /api/me/merge-requests/mr-1/dismiss': () =>
        Response.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 }),
    });

    renderAt(
      <>
        <MeObserver />
        <MergeSheet request={request} open onClose={onClose} />
      </>,
      { route: '/trips' },
    );

    const gotItBtn = await screen.findByRole('button', { name: 'Got it' });
    await user.click(gotItBtn);

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables cancel button while in-flight and prevents duplicate requests', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const request = makeRequest({ status: 'pending' });

    let resolveCancel!: (value: Response) => void;
    const cancelPromise = new Promise<Response>((resolve) => {
      resolveCancel = resolve;
    });

    const { calls } = mockApi({
      'GET /api/me': me(['google'], [request]),
      'POST /api/me/merge-requests/mr-1/cancel': () => cancelPromise,
    });

    renderAt(
      <>
        <MeObserver />
        <MergeSheet request={request} open onClose={onClose} />
      </>,
      { route: '/trips' },
    );

    const cancelBtn = await screen.findByRole('button', { name: 'Cancel request' });
    await user.click(cancelBtn);

    expect(cancelBtn).toBeDisabled();

    // Click again while disabled
    fireEvent.click(cancelBtn);

    const cancelCalls = calls.filter(
      (c) => c.method === 'POST' && c.path === '/api/me/merge-requests/mr-1/cancel',
    );
    expect(cancelCalls).toHaveLength(1);

    resolveCancel(new Response(null, { status: 204 }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('inside Zalo WebView: pending zalo request still shows link Sign in with Zalo to confirm', async () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ZALO_UA);
    const request = makeRequest({ provider: 'zalo', status: 'pending' });
    mockApi({ 'GET /api/me': me(['google'], [request]) });

    renderAt(
      <>
        <MeObserver />
        <MergeSheet request={request} open onClose={vi.fn()} />
      </>,
      { route: '/trips' },
    );

    expect(
      screen.getByRole('link', { name: 'Sign in with Zalo to confirm' }),
    ).toBeInTheDocument();
  });

  it('inside Zalo WebView: pending google request shows browser hint and no sign-in link', async () => {
    uaSpy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ZALO_UA);
    const request = makeRequest({ provider: 'google', status: 'pending' });
    mockApi({ 'GET /api/me': me(['zalo'], [request]) });

    renderAt(
      <>
        <MeObserver />
        <MergeSheet request={request} open onClose={vi.fn()} />
      </>,
      { route: '/trips' },
    );

    expect(
      screen.getByText(
        'Used Google before? Tap ⋯ → Open in browser to sign in with Google, then link Zalo in the account menu.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Sign in with Google to confirm/ })).toBeNull();
  });
});
