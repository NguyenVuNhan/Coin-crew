import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PersonKey, ProposalView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { ProposalBanner } from '../ProposalBanner';

afterEach(() => {
  vi.unstubAllGlobals();
});

const proposal1: ProposalView = {
  id: 'pr-1',
  tripId: 't-dl',
  tripName: 'Đà Lạt',
  tripKind: 'group',
  guestName: 'Minh',
  guestKey: 'p:minh' as PersonKey,
  requestedByName: 'Nhan',
  targetUserName: null,
  waitingFor: ['user'],
  status: 'pending',
};

const proposal2: ProposalView = {
  id: 'pr-2',
  tripId: 't-vt',
  tripName: 'Vũng Tàu',
  tripKind: 'group',
  guestName: 'Minh M',
  guestKey: 'p:minh-2' as PersonKey,
  requestedByName: 'Nhan',
  targetUserName: null,
  waitingFor: ['user'],
  status: 'pending',
};

describe('ProposalBanner', () => {
  it('renders nothing without pending incoming', async () => {
    mockApi({
      'GET /api/me/proposals': { incoming: [], outgoing: [] },
    });

    renderAt(<ProposalBanner />);

    await waitFor(() => {
      expect(screen.queryByTestId('proposal-banner')).toBeNull();
    });
  });

  it('shows one item and accepts it', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/me/proposals': { incoming: [proposal1], outgoing: [] },
      'POST /api/me/proposals/pr-1/accept': { status: 'approved' },
    });

    renderAt(<ProposalBanner />);

    expect(await screen.findByText('Nhan says this is you')).toBeInTheDocument();
    expect(screen.getByText('"Minh" in Đà Lạt')).toBeInTheDocument();

    await user.click(screen.getByTestId('proposal-accept-pr-1'));

    await waitFor(() => {
      const call = calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/proposals/pr-1/accept',
      );
      expect(call).toBeDefined();
    });
  });

  it('declines', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/me/proposals': { incoming: [proposal1], outgoing: [] },
      'POST /api/me/proposals/pr-1/decline': null,
    });

    renderAt(<ProposalBanner />);

    const declineBtn = await screen.findByTestId('proposal-decline-pr-1');
    await user.click(declineBtn);

    await waitFor(() => {
      const call = calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/proposals/pr-1/decline',
      );
      expect(call).toBeDefined();
    });
  });

  it('banner groups proposals from one requester and Accept all accepts each', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /api/me/proposals': { incoming: [proposal1, proposal2], outgoing: [] },
      'POST /api/me/proposals/pr-1/accept': { status: 'approved' },
      'POST /api/me/proposals/pr-2/accept': { status: 'approved' },
    });

    renderAt(<ProposalBanner />);

    await screen.findByText('Nhan says this is you');
    expect(screen.getAllByTestId('proposal-banner')).toHaveLength(1);

    await user.click(screen.getByTestId('proposal-accept-all'));

    await waitFor(() => {
      const call1 = calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/proposals/pr-1/accept',
      );
      const call2 = calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/proposals/pr-2/accept',
      );
      expect(call1).toBeDefined();
      expect(call2).toBeDefined();
    });
  });
});
