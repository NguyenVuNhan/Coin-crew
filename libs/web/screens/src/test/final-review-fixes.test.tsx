import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { MeResponse, TripView } from '@cc/core';
import { browserPlatform } from '@cc/web-platform';
import { sessionStore } from '@cc/web-platform/session';
import { signOut } from '@cc/web-data-access/signOut';
import { useSetMyTheme } from '@cc/web-data-access/theme';
import { en } from '@cc/web-i18n/en';
import { renderAt, mockApi } from './render';
import { tripView } from './fixtures';
import { GroupThemeScope, useGroupTheme } from '../lib/groupTheme';
import { TripBaseProvider } from '../lib/tripBase';
import { People } from '../screens/People';
import { CreateTrip } from '../screens/CreateTrip';

// Regression tests for the final cross-part review of the rewrite (Parts 1–4).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('M-1: saving your theme touches only the session answer', () => {
  it("doesn't cancel or refetch the other ['me', …] queries", async () => {
    mockApi({ 'PATCH /api/me': null, 'GET /api/me': { user: { id: 'u1', name: 'Minh', theme: 'sky' } } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData<MeResponse>(['me'], { user: { id: 'u1', name: 'Minh', theme: null } } as unknown as MeResponse);
    queryClient.setQueryData(['me', 'ledger'], { people: [] });
    queryClient.setQueryData(['me', 'activity'], { items: [] });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSetMyTheme(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('sky');
    });

    // The session answer is marked stale (so it refetches); the person's other lists are left alone.
    expect(queryClient.getQueryState(['me'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['me', 'ledger'])?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(['me', 'activity'])?.isInvalidated).toBe(false);
  });
});

describe('M-3: sign-out forgets the per-group choices', () => {
  it("clears 'Share anyway' and the seen updates, and keeps the language", async () => {
    mockApi({ 'POST /api/auth/logout': null });
    await sessionStore.init(browserPlatform);
    localStorage.setItem('cc.bankFirst.skip.t-1', '1');
    localStorage.setItem('fsl_seen_tx_updates_t-1', '["x-1"]');
    localStorage.setItem('fsl_lang', 'vi');

    await signOut(browserPlatform, new QueryClient());

    expect(localStorage.getItem('cc.bankFirst.skip.t-1')).toBeNull();
    expect(localStorage.getItem('fsl_seen_tx_updates_t-1')).toBeNull();
    expect(localStorage.getItem('fsl_lang')).toBe('vi');
  });
});

describe("M-4: a group's colours hold while its view is fetched again", () => {
  function Probe() {
    return <span data-testid="group-theme">{useGroupTheme() ?? 'none'}</span>;
  }

  function scope(queryClient: QueryClient, tripId: string) {
    return (
      <QueryClientProvider client={queryClient}>
        <TripBaseProvider tripId={tripId} token="tok">
          <GroupThemeScope>
            <Probe />
          </GroupThemeScope>
        </TripBaseProvider>
      </QueryClientProvider>
    );
  }

  const coloured = (id: string): TripView => {
    const view = tripView();
    return { ...view, trip: { ...view.trip, id, theme: 'pink' } };
  };

  it('keeps Pink when "Who are you?" drops the cached view, and follows the next answer', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['trip', 't-1'], coloured('t-1'));
    render(scope(queryClient, 't-1'));
    expect(screen.getByTestId('group-theme')).toHaveTextContent('pink');

    // TanStack tells cache subscribers on a later tick: let it arrive before checking.
    await act(async () => {
      queryClient.removeQueries({ queryKey: ['trip', 't-1'] });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(queryClient.getQueryData(['trip', 't-1'])).toBeUndefined();
    expect(screen.getByTestId('group-theme')).toHaveTextContent('pink');

    act(() => queryClient.setQueryData(['trip', 't-1'], { ...coloured('t-1'), trip: { ...coloured('t-1').trip, theme: null } }));
    await waitFor(() => expect(screen.getByTestId('group-theme')).toHaveTextContent('none'));
  });

  it("another group never inherits them", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['trip', 't-1'], coloured('t-1'));
    const { rerender } = render(scope(queryClient, 't-1'));
    expect(screen.getByTestId('group-theme')).toHaveTextContent('pink');

    rerender(scope(queryClient, 't-2'));
    expect(screen.getByTestId('group-theme')).toHaveTextContent('none');
  });
});

describe('M-5: a failed add says so in plain words', () => {
  it('a network failure shows the generic line, never "Failed to fetch"', async () => {
    mockApi({
      'GET /api/trips/t-1': tripView(),
      'POST /api/trips/t-1/people': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    renderAt(<People />, { route: '/t/t-1/people', path: '/t/:tripId/people' });
    await userEvent.type(await screen.findByLabelText('Name to add'), 'An{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't add An.");
    expect(alert).toHaveTextContent(en['error.generic']);
    expect(alert).not.toHaveTextContent('Failed to fetch');
  });
});

describe('M-6: creating a sport group, a typed name joins like Enter would add it', () => {
  it('a name left in the field takes the gender last used', async () => {
    const { calls } = mockApi({
      'GET /api/me': { user: { id: 'u1', email: 'm@e.com', name: 'Minh', gender: 'M', consentAt: '2026-10-12T00:00:00Z' } },
      'GET /api/me/people': [],
      'POST /api/trips': () => Response.json({ tripId: 't-9' }, { status: 201 }),
    });
    renderAt(<CreateTrip />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Sport group' }));
    await userEvent.type(screen.getByLabelText('Group name'), 'Cầu lông');
    const field = screen.getByLabelText('Name to add');
    await userEvent.type(field, 'Chi');
    await userEvent.click(screen.getByRole('button', { name: '+ Female' }));
    await userEvent.type(field, 'Lan');
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/trips')).toBe(true));
    const body = calls.find((c) => c.method === 'POST' && c.path === '/api/trips')!.body as { people: unknown[] };
    expect(body.people).toEqual([
      { name: 'Chi', gender: 'F' },
      { name: 'Lan', gender: 'F' },
    ]);
  });
});
