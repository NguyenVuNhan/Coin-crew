import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, renderHook, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { en } from '../i18n/en';
import { vi as viMessages } from '../i18n/vi';
import { t, setLang } from '../i18n';
import { InlineError } from '../components/InlineError';
import { Amount } from '../components/Amount';
import { apiFetch, ApiClientError } from '../api/client';
import { linkTokens } from '../lib/linkTokens';
import { useTripView } from '../api/hooks';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe('i18n', () => {
  it('Vietnamese has exactly the English keys', () => expect(Object.keys(viMessages).sort()).toEqual(Object.keys(en).sort()));
  it('uses the spec copy for fewest transfers', () => {
    setLang('en');
    expect(t('fewest.explain')).toBe("We combine everyone's debts so people make as few bank transfers as possible. What each person owes in total stays the same.");
  });
  it('fills variables', () => {
    setLang('en');
    expect(t('who.areYou', { name: 'Bình' })).toBe('Are you Bình?');
  });
});

describe('shared components', () => {
  it('InlineError shows the daily-limit copy', () => {
    setLang('en');
    render(<InlineError error={new ApiClientError('DAILY_LIMIT', 503, 'x')} onRetry={() => {}} />);
    expect(screen.getByText("We're over today's free limit. Try again after 07:00.")).toBeInTheDocument();
  });
  it('InlineError offers a retry for other errors', async () => {
    setLang('en');
    const onRetry = vi.fn();
    render(<InlineError error={new ApiClientError('INTERNAL', 500, 'boom')} onRetry={onRetry} />);
    expect(screen.getByText('Something went wrong. Try again.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
  it('Amount formats VND', () => {
    render(<Amount value={1245000} />);
    expect(screen.getByText('1.245.000₫')).toBeInTheDocument();
  });
});

describe('apiFetch', () => {
  it('sends the stored link token for the trip and turns errors into ApiClientError', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ error: { code: 'LINK_DEAD', message: 'gone' } }, { status: 410 }));
    vi.stubGlobal('fetch', fetchMock);
    linkTokens.set('t1', 'tok-1');
    const err = await apiFetch('/api/trips/t1', { tripId: 't1' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ code: 'LINK_DEAD', status: 410 });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('X-Link-Token')).toBe('tok-1');
  });

  it('remembers a new device id and sends it back for restoring', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'dev-1' } }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/api/health');
    await apiFetch('/api/health');
    const second = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(new Headers(second.headers).get('X-Device-Restore')).toBe('dev-1');
  });
});

describe('useTripView', () => {
  function mockTrip() {
    const state = { version: 1, versionCalls: 0 };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/version')) {
        state.versionCalls++;
        return Response.json({ version: state.version });
      }
      return Response.json({ trip: { id: 't1', version: state.version } });
    }));
    return state;
  }

  it('refetches the view when the version changes', async () => {
    const state = mockTrip();
    const { result } = renderHook(() => useTripView('t1', 30), { wrapper });
    await waitFor(() => expect(result.current.view?.trip.version).toBe(1));
    state.version = 2;
    await waitFor(() => expect(result.current.view?.trip.version).toBe(2));
  });

  it('does not poll while the page is hidden', async () => {
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const state = mockTrip();
    const { result } = renderHook(() => useTripView('t1', 20), { wrapper });
    await waitFor(() => expect(result.current.view).toBeDefined());
    await new Promise((r) => setTimeout(r, 150));
    expect(state.versionCalls).toBe(0);
    spy.mockRestore();
  });

  it('resumes by itself when the page becomes visible again', async () => {
    mockTrip();
    let visibility: DocumentVisibilityState = 'visible';
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const { result } = renderHook(() => useTripView('t1', 20, { stopAfterMs: 100 }), { wrapper });
    await waitFor(() => expect(result.current.stopped).toBe(true), { timeout: 1000 });
    act(() => {
      visibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    act(() => {
      visibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.stopped).toBe(false);
    spy.mockRestore();
  });

  it('stops after stopAfterMs and resumes on request', async () => {
    mockTrip();
    const { result } = renderHook(() => useTripView('t1', 20, { stopAfterMs: 100 }), { wrapper });
    await waitFor(() => expect(result.current.stopped).toBe(true), { timeout: 1000 });
    act(() => result.current.resume());
    expect(result.current.stopped).toBe(false);
  });
});
