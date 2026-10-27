import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router';
import type { IncomingMergeRequest, MeResponse, MeUserView } from '@fsl/core';
import { renderAt, mockApi } from '../../test/render';
import { MyTrips } from '../MyTrips';

const mr6: IncomingMergeRequest = {
  id: 'mr-6',
  provider: 'zalo',
  expiresAt: '2026-10-27T00:00:00Z',
  survivor: {
    name: 'Lan',
    avatarUrl: null,
    email: 'lan@example.com',
    providers: ['google'],
  },
  groups: { survivor: 2, merged: 1 },
  released: [{ provider: 'google', email: 'b@x.com' }],
};

const mr7: IncomingMergeRequest = {
  id: 'mr-7',
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

function SearchProbe() {
  const l = useLocation();
  return <div data-testid="search">{l.search}</div>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('my trips merge review', () => {
  it('opens the confirmation sheet for the matching request', async () => {
    mockApi({
      'GET /api/me': me([mr6, mr7]),
      'GET /api/trips': [],
    });

    renderAt(
      <>
        <MyTrips />
        <SearchProbe />
      </>,
      { route: '/trips?mergeReview=mr-7' },
    );

    const dialog = await screen.findByRole('dialog', { name: 'Merge accounts?' });
    expect(dialog).toHaveTextContent('Minh');

    await waitFor(() => {
      expect(screen.getByTestId('search')).not.toHaveTextContent('mergeReview');
    });
  });

  it('says so when no request matches', async () => {
    mockApi({
      'GET /api/me': me([]),
      'GET /api/trips': [],
    });

    renderAt(
      <>
        <MyTrips />
        <SearchProbe />
      </>,
      { route: '/trips?mergeReview=mr-7' },
    );

    expect(
      await screen.findByText('This account has no merge request waiting.'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('search')).not.toHaveTextContent('mergeReview');
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not decide there is no request while /api/me is loading', async () => {
    let resolveMe!: (res: Response) => void;
    const mePromise = new Promise<Response>((resolve) => {
      resolveMe = resolve;
    });

    mockApi({
      'GET /api/me': () => mePromise,
      'GET /api/trips': [],
    });

    renderAt(
      <>
        <MyTrips />
        <SearchProbe />
      </>,
      { route: '/trips?mergeReview=mr-7' },
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('This account has no merge request waiting.')).toBeNull();
    expect(screen.getByTestId('search')).toHaveTextContent('mergeReview=mr-7');

    resolveMe(Response.json(me([mr7])));

    expect(await screen.findByRole('dialog', { name: 'Merge accounts?' })).toBeInTheDocument();
  });

  it('keeps other parameters', async () => {
    mockApi({
      'GET /api/me': me([mr7]),
      'GET /api/trips': [],
    });

    renderAt(
      <>
        <MyTrips />
        <SearchProbe />
      </>,
      { route: '/trips?mergeReview=mr-7&foo=1' },
    );

    await screen.findByRole('dialog', { name: 'Merge accounts?' });

    await waitFor(() => {
      const search = screen.getByTestId('search');
      expect(search).toHaveTextContent('foo=1');
      expect(search).not.toHaveTextContent('mergeReview');
    });
  });

  it('shows the first incoming request when there is no mergeReview', async () => {
    mockApi({
      'GET /api/me': me([mr6]),
      'GET /api/trips': [],
    });

    renderAt(
      <>
        <MyTrips />
        <SearchProbe />
      </>,
      { route: '/trips' },
    );

    expect(await screen.findByRole('button', { name: 'Review & merge' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
