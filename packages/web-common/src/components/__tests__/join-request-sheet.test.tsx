import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JoiningMergeRequest, MeResponse, MeUserView, TripView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { tripView, PIDS } from '../../test/fixtures';
import { MyTrips } from '../../screens/MyTrips';
import { AccountMenu } from '../AccountMenu';
import { JoinRequestSheet } from '../JoinRequestSheet';
import { ExpensePaymentsApproval } from '../ExpensePaymentsApproval';
import { PaymentDetails } from '../PaymentDetails';

const joiningEmpty: JoiningMergeRequest = {
  id: 'j-1',
  expiresAt: '2026-11-10T00:00:00Z',
  zalo: {
    name: 'Thao',
    avatarUrl: null,
  },
  groups: [],
  collapsing: [],
};

const joiningWithCollapse: JoiningMergeRequest = {
  id: 'j-2',
  expiresAt: '2026-11-10T00:00:00Z',
  zalo: {
    name: 'Thao Zalo',
    avatarUrl: 'https://example.com/avatar.jpg',
  },
  groups: [{ tripId: 't-1', name: 'Đà Lạt Trip' }],
  collapsing: [
    {
      tripId: 't-1',
      name: 'Đà Lạt Trip',
      zaloPersonName: 'Thao Zalo',
      yourPersonName: 'Thao Google',
    },
  ],
};

function me(
  joiningReqs: JoiningMergeRequest[] = [],
  userOverrides: Partial<MeUserView> = {},
): MeResponse {
  return {
    user: {
      id: 'u-google',
      email: 'thao@example.com',
      name: 'Thao Google',
      consentAt: '2026-01-01T00:00:00Z',
      providers: ['google'],
      ...userOverrides,
    },
    signIn: { zalo: true },
    mergeRequests: {
      incoming: [],
      outgoing: [],
      joining: joiningReqs,
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('JoinRequestSheet and joining workflow', () => {
  it('with one joining entry and empty groups, there is no warning, and Accept posts to /api/me/merge-requests/<id>/accept', async () => {
    const user = userEvent.setup();
    let accepted = false;

    const { calls } = mockApi({
      'GET /api/me': () =>
        Response.json(accepted ? me([]) : me([joiningEmpty])),
      'GET /api/trips': [],
      'POST /api/me/merge-requests/j-1/accept': () => {
        accepted = true;
        return Response.json({ success: true });
      },
    });

    renderAt(<MyTrips />, { route: '/trips' });

    // Banner is shown
    const bannerText = await screen.findByText('A Zalo account (Thao) wants to join your account');
    expect(bannerText).toBeInTheDocument();

    // Tap opens JoinRequestSheet
    await user.click(bannerText);

    const sheet = await screen.findByTestId('join-request-sheet');
    expect(sheet).toBeInTheDocument();
    expect(within(sheet).getByText('Thao')).toBeInTheDocument();
    expect(
      within(sheet).getByText('This Zalo login will become a way to sign in to your account.'),
    ).toBeInTheDocument();

    // Empty groups: no warning block
    expect(within(sheet).queryByText('These groups move to your account:')).toBeNull();

    // Accept calls /accept, refetches me, and shows Snackbar
    const acceptBtn = within(sheet).getByRole('button', { name: 'Accept' });
    await user.click(acceptBtn);

    const acceptCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/merge-requests/j-1/accept',
    );
    expect(acceptCall).toBeDefined();

    expect(await screen.findByText('Zalo account joined')).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.queryByText('A Zalo account (Thao) wants to join your account'),
      ).toBeNull();
    });

    const meCalls = calls.filter((c) => c.method === 'GET' && c.path === '/api/me');
    expect(meCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('with collapsing, the collapse line is shown', async () => {
    mockApi({
      'GET /api/me': me([joiningWithCollapse]),
    });

    renderAt(
      <JoinRequestSheet
        request={joiningWithCollapse}
        open={true}
        onClose={() => {}}
      />,
    );

    const sheet = await screen.findByTestId('join-request-sheet');
    expect(within(sheet).getByText('Thao Zalo')).toBeInTheDocument();
    expect(within(sheet).getByText('These groups move to your account:')).toBeInTheDocument();
    expect(within(sheet).getByText('Đà Lạt Trip')).toBeInTheDocument();
    expect(
      within(sheet).getByText('In Đà Lạt Trip, Thao Zalo and Thao Google become one person'),
    ).toBeInTheDocument();
  });

  it('declining calls /decline and closes the sheet', async () => {
    const user = userEvent.setup();
    let declined = false;
    let closed = false;

    const { calls } = mockApi({
      'GET /api/me': () =>
        Response.json(declined ? me([]) : me([joiningEmpty])),
      'POST /api/me/merge-requests/j-1/decline': () => {
        declined = true;
        return new Response(null, { status: 204 });
      },
    });

    renderAt(
      <JoinRequestSheet
        request={joiningEmpty}
        open={true}
        onClose={() => {
          closed = true;
        }}
      />,
    );

    const declineBtn = await screen.findByRole('button', { name: 'Decline' });
    await user.click(declineBtn);

    const declineCall = calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/merge-requests/j-1/decline',
    );
    expect(declineCall).toBeDefined();
    expect(closed).toBe(true);
  });

  it('shows inline error with retry on failure', async () => {
    const user = userEvent.setup();
    let attempts = 0;

    mockApi({
      'GET /api/me': me([joiningEmpty]),
      'POST /api/me/merge-requests/j-1/accept': () => {
        attempts++;
        if (attempts === 1) {
          return Response.json(
            { error: { code: 'INTERNAL', message: 'Failed' } },
            { status: 500 },
          );
        }
        return Response.json({ success: true });
      },
    });

    renderAt(
      <JoinRequestSheet
        request={joiningEmpty}
        open={true}
        onClose={() => {}}
      />,
    );

    const acceptBtn = await screen.findByRole('button', { name: 'Accept' });
    await user.click(acceptBtn);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    const retryBtn = await screen.findByRole('button', { name: 'Try again' });
    await user.click(retryBtn);

    expect(attempts).toBe(2);
  });

  it('AccountMenu shows dot and joining banner', async () => {
    mockApi({
      'GET /api/me': me([joiningEmpty]),
    });

    renderAt(<AccountMenu />, { route: '/trips' });

    const trigger = await screen.findByRole('button', { name: /account/i });
    expect(within(trigger).getByLabelText('A merge request is waiting')).toBeInTheDocument();
  });

  it('a payment row with claimPending shows the flag text in ExpensePaymentsApproval', async () => {
    const trip: TripView = tripView({
      payments: [
        {
          id: 'pay-1',
          fromId: PIDS.A,
          toId: PIDS.M,
          amountClaimed: 385000,
          amountConfirmed: null,
          status: 'says_paid',
          notArrived: false,
          createdAt: '2026-10-10T12:00:00Z',
          expenseId: 'e-1',
          claimPending: true,
        },
      ],
    });

    renderAt(
      <ExpensePaymentsApproval
        view={trip}
        expenseId="e-1"
        paymentIds={['pay-1']}
      />,
    );

    expect(
      await screen.findByText('Marked by a Zalo account waiting to join An'),
    ).toBeInTheDocument();
  });

  it('a says_paid payment with claimPending shows the flag text in PaymentDetails', async () => {
    const trip: TripView = tripView({
      payments: [
        {
          id: 'pay-1',
          fromId: PIDS.A,
          toId: PIDS.M,
          amountClaimed: 385000,
          amountConfirmed: null,
          status: 'says_paid',
          notArrived: false,
          createdAt: '2026-10-10T12:00:00Z',
          expenseId: 'e-1',
          claimPending: true,
        },
      ],
    });

    renderAt(
      <PaymentDetails
        view={trip}
        paymentId="pay-1"
        onClose={() => {}}
      />,
    );

    expect(
      await screen.findByText('Marked by a Zalo account waiting to join An'),
    ).toBeInTheDocument();
  });
});
