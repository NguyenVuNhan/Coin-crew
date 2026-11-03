import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PersonSummary, ProposalView, TripView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { guestChiView, tripView, PIDS } from '../../test/fixtures';
import { PersonScreen } from '../PersonScreen';
import { TripRoute } from '../TripRoute';
import { ApprovalItem } from '../../components/ApprovalsCard';

const me = () => ({
  user: { id: 'u-owner', email: 'owner@example.com', name: 'Owner', consentAt: '2026-10-12T00:00:00.000Z' },
});

const guestMinh: PersonSummary = {
  key: 'p:p-minh', name: 'Minh', nickname: null, userId: null, groupLabel: 'Đà Lạt', total: 0,
  items: [], waiting: [], linked: [],
};

const proposal = (over: Partial<ProposalView>): ProposalView => ({
  id: 'pr-1', tripId: 't-dl', tripName: 'Đà Lạt', tripKind: 'group', guestName: 'Minh', guestKey: 'p:p-minh',
  requestedByName: 'Owner', targetUserName: 'Minh Nguyễn', waitingFor: ['user', 'admin'], status: 'pending', ...over,
});

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('merge requests on the person page', () => {
  it('person page shows waiting row and cancel calls the API', async () => {
    const { calls } = mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [guestMinh] },
      'GET /api/me/proposals': { incoming: [], outgoing: [proposal({})] },
      'POST /api/me/proposals/pr-1/cancel': null,
    });
    renderAt(<PersonScreen />, { route: '/people/p%3Ap-minh', path: '/people/:key' });

    expect(await screen.findByText('Waiting for Minh Nguyễn and the Đà Lạt admin')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('proposal-cancel-pr-1'));
    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST' && c.path === '/api/me/proposals/pr-1/cancel')).toBe(true);
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Request cancelled');
  });

  it('declined proposal shows a declined note', async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [guestMinh] },
      'GET /api/me/proposals': { incoming: [], outgoing: [proposal({ status: 'declined', waitingFor: [] })] },
    });
    renderAt(<PersonScreen />, { route: '/people/p%3Ap-minh', path: '/people/:key' });
    expect(await screen.findByText('The request to merge Minh was declined')).toBeInTheDocument();
    expect(screen.queryByTestId('proposal-cancel-pr-1')).toBeNull();
  });

  it("requests about someone else don't show", async () => {
    mockApi({
      'GET /api/me': me(),
      'GET /api/me/people/summary': { incomplete: false, people: [guestMinh] },
      'GET /api/me/proposals': { incoming: [], outgoing: [proposal({ guestKey: 'p:p-other' })] },
    });
    renderAt(<PersonScreen />, { route: '/people/p%3Ap-minh', path: '/people/:key' });
    await screen.findByTestId('person-edit');
    expect(screen.queryByTestId('proposal-waiting-pr-1')).toBeNull();
  });
});

describe('admin approval card', () => {
  it('admin approval card approves a proposal', async () => {
    const view: TripView = tripView();
    const { calls } = mockApi({ 'POST /api/trips/t-1/proposals/pr-9/approve': null });
    renderAt(
      <ApprovalItem
        view={view}
        approval={{ kind: 'proposal', proposalId: 'pr-9', guestPid: PIDS.C, intoPid: null, targetUserName: 'Chi Nguyễn', requestedByName: 'Minh' }}
      />,
    );
    expect(screen.getByText('Minh says "Chi" is Chi Nguyễn')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips/t-1/proposals/pr-9/approve')).toBe(true);
    });
  });
});

describe('claim screen', () => {
  it('claim answered PROPOSAL_PENDING shows accept prompt', async () => {
    mockMedia({ wide: false });
    const { calls } = mockApi({
      'GET /api/trips/t-1/version': { version: 3 },
      'GET /api/trips/t-1': guestChiView(),
      'POST /api/trips/t-1/membership': () =>
        Response.json(
          { error: { code: 'PROPOSAL_PENDING', message: 'Someone already said this is you.', proposalId: 'pr-5', requestedByName: 'Minh' } },
          { status: 409 },
        ),
      'POST /api/me/proposals/pr-5/accept': { status: 'waiting' },
    });
    renderAt(<TripRoute />, { route: '/t/t-1?becomeMember=1', path: '/t/:tripId' });

    expect(await screen.findByText('Minh already said this is you')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('proposal-claim-accept'));
    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST' && c.path === '/api/me/proposals/pr-5/accept')).toBe(true);
    });
    expect(await screen.findByText('You asked to become a member. A member will approve it.')).toBeInTheDocument();
  });
});
