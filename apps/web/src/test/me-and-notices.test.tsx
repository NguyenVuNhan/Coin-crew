import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import type { Approval, TripView } from '@fsl/core';
import { setLang } from '../i18n';
import { renderAt, mockApi } from './render';
import { tripView, PIDS } from './fixtures';
import { useMe } from '../api/hooks';
import { AuthNotice } from '../components/AuthNotice';
import { AccountMenu } from '../components/AccountMenu';
import { ApprovalItem } from '../components/ApprovalsCard';
import { InlineError } from '../components/InlineError';
import { ApiClientError } from '../api/client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  setLang('en');
});

function ApprovalsCard({ view }: { view: TripView }) {
  const approval = view.approvals[0];
  if (!approval) return null;
  return <ApprovalItem view={view} approval={approval} />;
}

describe('Task 15: useMe, AuthNotice, nullable email', () => {
  it('useMe fills in what an older API leaves out', async () => {
    mockApi({ 'GET /api/me': { user: null } });

    function Probe() {
      const { data } = useMe();
      if (!data) return null;
      return (
        <div>
          <div>{'zalo:' + String(data.signIn.zalo)}</div>
          <div>{'incoming:' + data.mergeRequests.incoming.length}</div>
        </div>
      );
    }

    renderAt(<Probe />);
    expect(await screen.findByText('zalo:false')).toBeInTheDocument();
    expect(await screen.findByText('incoming:0')).toBeInTheDocument();
  });

  it('AuthNotice shows the failure and clears the flag', async () => {
    function SearchProbe() {
      const location = useLocation();
      return <div data-testid="search">{location.search}</div>;
    }

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/trips?auth=failed']}>
          <AuthNotice />
          <SearchProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent("Sign-in didn't finish — try again");
      expect(screen.getByTestId('search').textContent).not.toContain('auth=');
    });
  });

  it('AuthNotice says what was linked and when a merge was requested', async () => {
    const { unmount } = renderAt(<AuthNotice />, { route: '/trips?linked=zalo' });
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Zalo is now linked');
    });
    unmount();

    renderAt(<AuthNotice />, { route: '/trips?merge=requested&provider=zalo' });
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'This Zalo account already has its own CoinCrew account. Sign in to that account to confirm the merge (expires in 7 days).',
      );
    });
  });

  it('the account menu shows the Zalo label without an email', async () => {
    mockApi({});
    renderAt(<AccountMenu user={{ name: 'Lan', email: null }} />);
    const trigger = await screen.findByRole('button', { name: /Account/ });
    await userEvent.click(trigger);
    expect(screen.getByText('Zalo account')).toBeInTheDocument();
  });

  it('a Zalo membership approval shows · Zalo', () => {
    const approval: Extract<Approval, { kind: 'membership' }> = {
      kind: 'membership',
      requestId: 'req-1',
      participantId: PIDS.M,
      userName: 'Lan',
      userEmail: null,
    };
    const view = tripView({
      approvals: [approval],
    });

    renderAt(<ApprovalsCard view={view} />);
    expect(screen.getByText('Lan · Zalo')).toBeInTheDocument();
  });

  it('maps the two new errors', () => {
    const { unmount } = render(<InlineError error={new ApiClientError('LAST_IDENTITY', 400, 'x')} />);
    expect(screen.getByText('Link another way to sign in first.')).toBeInTheDocument();
    unmount();

    render(<InlineError error={new ApiClientError('MERGE_STALE', 400, 'x')} />);
    expect(screen.getByText('This merge request is no longer valid.')).toBeInTheDocument();
  });
});
