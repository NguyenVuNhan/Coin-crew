import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthProvider, MeResponse, OutgoingMergeRequest, TripView } from '@cc/core';
import { renderAt, mockApi } from '../../test/render';
import { fakePlatform } from '../../test/fakePlatform';
import { PIDS, guestChiView } from '../../test/fixtures';
import { sportFundView } from '../../test/fundFixtures';
import { LinkedAccounts } from '../LinkedAccounts';
import { MergeSheet } from '../MergeSheet';
import { RatingsScreen } from '../../screens/RatingsScreen';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function me(
  providers: AuthProvider[] = ['zalo'],
  outgoing: OutgoingMergeRequest[] = [],
  email: string | null = null,
): MeResponse {
  return {
    user: {
      id: 'u1',
      email,
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

function buildSportRatingsView(overrides: Partial<TripView> = {}): TripView {
  const base = sportFundView();
  return {
    ...base,
    ratings: {
      enabled: true,
      totalStars: {
        [PIDS.M]: 12,
        [PIDS.A]: 18,
        [PIDS.B]: 14,
        [PIDS.C]: 11,
      },
      maxStars: 8,
      myAllocations: {
        [PIDS.A]: 5,
        [PIDS.B]: 1,
      },
    },
    ...overrides,
  };
}

describe('zmp oauth links', () => {
  it('zmp: linked accounts has no /api/auth links', async () => {
    const user = userEvent.setup();
    const openExternal = vi.fn().mockResolvedValue('opened');
    const platform = fakePlatform({ kind: 'zmp', openExternal });

    const { container } = renderAt(<LinkedAccounts me={me(['zalo'])} />, { platform });

    const authLinks = container.querySelectorAll('[href*="/api/auth/"]');
    expect(authLinks).toHaveLength(0);

    expect(
      screen.getByText('Linking Google or another sign-in method works on the web app:'),
    ).toBeInTheDocument();

    const openWebBtn = container.querySelector<HTMLButtonElement>('.fsl-linked__open-web');
    expect(openWebBtn).not.toBeNull();
    await user.click(openWebBtn!);

    expect(openExternal).toHaveBeenCalledWith('https://api.test/groups');
    expect(platform.calls['openExternal']).toEqual([['https://api.test/groups']]);
  });

  it('web: linked accounts still offers linking', () => {
    const { container } = renderAt(<LinkedAccounts me={me(['zalo'])} />);
    const link = container.querySelector('a[href*="/api/auth/google/start"]');
    expect(link).toBeInTheDocument();
  });

  it('zmp: merge sheet has no /api/auth links', () => {
    const platform = fakePlatform({ kind: 'zmp' });
    const pendingRequest = makeRequest({ status: 'pending' });
    mockApi({ 'GET /api/me': me(['google'], [pendingRequest]) });

    renderAt(
      <MergeSheet request={pendingRequest} open onClose={vi.fn()} />,
      { platform },
    );

    const pendingAuthLinks = document.querySelectorAll('[href*="/api/auth/"]');
    expect(pendingAuthLinks).toHaveLength(0);
    expect(
      screen.getByText('Linking Google or another sign-in method works on the web app:'),
    ).toBeInTheDocument();
    expect(document.querySelector('.fsl-merge__open-web')).toBeInTheDocument();

    const declinedRequest = makeRequest({ status: 'declined' });
    renderAt(
      <MergeSheet request={declinedRequest} open onClose={vi.fn()} />,
      { platform },
    );

    const declinedAuthLinks = document.querySelectorAll('[href*="/api/auth/"]');
    expect(declinedAuthLinks).toHaveLength(0);
    expect(document.querySelector('.fsl-merge__open-web')).toBeInTheDocument();
  });

  it('zmp: ratings sign-in uses Zalo', () => {
    const gView = {
      ...buildSportRatingsView(),
      me: guestChiView().me,
    };
    const platform = fakePlatform({ kind: 'zmp' });

    const { container } = renderAt(<RatingsScreen view={gView} />, { platform });

    expect(screen.getByText('Continue with your Zalo account')).toBeInTheDocument();
    const googleLinks = container.querySelectorAll('[href*="/api/auth/google"]');
    expect(googleLinks).toHaveLength(0);
  });
});
