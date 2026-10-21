import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IncomingMergeRequest, MeResponse, MeUserView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { MyTrips } from '../../screens/MyTrips';
import { AccountMenu } from '../AccountMenu';

const incoming: IncomingMergeRequest = {
  id: 'm-1',
  provider: 'zalo',
  expiresAt: '2026-10-27T00:00:00Z',
  survivor: {
    name: 'Minh',
    avatarUrl: null,
    email: 'minh@example.com',
    providers: ['google'],
  },
  groups: { survivor: 2, merged: 1 },
  released: [{ provider: 'google', email: 'b@x.com' }],
};

function me(
  incomingReqs: IncomingMergeRequest[] = [],
  userOverrides: Partial<MeUserView> = {},
): MeResponse {
  return {
    user: {
      id: 'u-b',
      email: 'b@x.com',
      name: 'Bee',
      consentAt: '2026-01-01T00:00:00Z',
      providers: ['google'],
      ...userOverrides,
    },
    signIn: { zalo: true },
    mergeRequests: {
      incoming: incomingReqs,
      outgoing: [],
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('merge request', () => {
  it('My Trips shows the banner', async () => {
    mockApi({
      'GET /api/me': me([incoming]),
      'GET /api/trips': [],
    });

    renderAt(<MyTrips />, { route: '/trips' });

    expect(
      await screen.findByText('Minh (minh@example.com) wants to merge this account into theirs'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review & merge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  });

  it('the confirm sheet says what moves and what is released', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me': me([incoming]),
      'GET /api/trips': [],
    });

    renderAt(<MyTrips />, { route: '/trips' });

    const reviewBtn = await screen.findByRole('button', { name: 'Review & merge' });
    await user.click(reviewBtn);

    const dialog = await screen.findByRole('dialog', { name: 'Merge accounts?' });
    expect(dialog).toHaveTextContent(
      "Your 1 groups, bank details and history move to Minh's account.",
    );
    expect(dialog).toHaveTextContent('Google b@x.com will no longer sign in here');

    const mergeBtn = within(dialog).getByRole('button', { name: 'Merge accounts' });
    expect(mergeBtn).toHaveClass('fsl-button--danger');
  });

  it('accepting clears the cache and refetches me', async () => {
    const user = userEvent.setup();
    let accepted = false;
    const { calls } = mockApi({
      'GET /api/me': () =>
        Response.json(
          accepted
            ? me([], { id: 'u-minh', name: 'Minh', email: 'minh@example.com' })
            : me([incoming]),
        ),
      'GET /api/trips': [],
      'POST /api/me/merge-requests/m-1/accept': () => {
        accepted = true;
        return Response.json({ user: { id: 'u-minh' } });
      },
    });

    renderAt(<MyTrips />, { route: '/trips' });

    const reviewBtn = await screen.findByRole('button', { name: 'Review & merge' });
    await user.click(reviewBtn);

    const dialog = await screen.findByRole('dialog', { name: 'Merge accounts?' });
    const mergeBtn = within(dialog).getByRole('button', { name: 'Merge accounts' });
    await user.click(mergeBtn);

    await waitFor(() => {
      expect(
        screen.queryByText('Minh (minh@example.com) wants to merge this account into theirs'),
      ).toBeNull();
    });

    const acceptCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/merge-requests/m-1/accept',
    );
    expect(acceptCall).toBeDefined();
    const meCalls = calls.filter((c) => c.method === 'GET' && c.path === '/api/me');
    expect(meCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('declining removes the banner', async () => {
    const user = userEvent.setup();
    let declined = false;
    const { calls } = mockApi({
      'GET /api/me': () =>
        Response.json(declined ? me([]) : me([incoming])),
      'GET /api/trips': [],
      'POST /api/me/merge-requests/m-1/decline': () => {
        declined = true;
        return new Response(null, { status: 204 });
      },
    });

    renderAt(<MyTrips />, { route: '/trips' });

    const declineBtn = await screen.findByRole('button', { name: 'Decline' });
    await user.click(declineBtn);

    await waitFor(() => {
      expect(
        screen.queryByText('Minh (minh@example.com) wants to merge this account into theirs'),
      ).toBeNull();
    });

    const declineCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/merge-requests/m-1/decline',
    );
    expect(declineCall).toBeDefined();
    const meCalls = calls.filter((c) => c.method === 'GET' && c.path === '/api/me');
    expect(meCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('shows MERGE_STALE', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /api/me': me([incoming]),
      'GET /api/trips': [],
      'POST /api/me/merge-requests/m-1/accept': () =>
        Response.json({ error: { code: 'MERGE_STALE', message: 'stale' } }, { status: 409 }),
    });

    renderAt(<MyTrips />, { route: '/trips' });

    const reviewBtn = await screen.findByRole('button', { name: 'Review & merge' });
    await user.click(reviewBtn);

    const dialog = await screen.findByRole('dialog', { name: 'Merge accounts?' });
    const mergeBtn = within(dialog).getByRole('button', { name: 'Merge accounts' });
    await user.click(mergeBtn);

    expect(await screen.findByText('This merge request is no longer valid.')).toBeInTheDocument();
  });

  it('the account button shows a dot while a request waits', async () => {
    mockApi({
      'GET /api/me': me([incoming]),
    });

    const { unmount } = renderAt(<AccountMenu />, { route: '/trips' });

    const trigger = await screen.findByRole('button', { name: /account/i });
    expect(within(trigger).getByLabelText('A merge request is waiting')).toBeInTheDocument();

    unmount();

    mockApi({
      'GET /api/me': me([]),
    });

    renderAt(<AccountMenu />, { route: '/trips' });

    const triggerWithoutDot = await screen.findByRole('button', { name: /account/i });
    expect(within(triggerWithoutDot).queryByLabelText('A merge request is waiting')).toBeNull();
  });
});
