import { BrowserRouter } from 'react-router';
import type { MeResponse } from '@cc/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { NavHistoryProvider } from './lib/navHistory';
import { detectLang, setLang } from '@cc/web-i18n';
import { refetchOnWindowFocus } from './api/focus';
import { ApiClientError, apiFetch } from './api/client';
import { browserPlatform, PlatformProvider, type PlatformBridge } from '@cc/web-platform';
import { sessionStore } from '@cc/web-platform/session';
import { zaloHandshake } from './platform/zaloSession';

/** One-time start-up shared by every shell (web, Zalo): language and focus refetch. */
export async function bootApp(platform: PlatformBridge = browserPlatform): Promise<void> {
  await sessionStore.init(platform);
  if (platform.kind === 'zmp') {
    await zaloBoot(platform);
  }
  setLang(detectLang());
  refetchOnWindowFocus();
}

/**
 * In Zalo: keep a stored token that still works, else recognise the Zalo user once.
 * At most one handshake per boot, and boot never fails because of it.
 */
async function zaloBoot(platform: PlatformBridge): Promise<void> {
  try {
    if (sessionStore.token() !== null) {
      try {
        const me = await apiFetch<Partial<MeResponse> | undefined>('/api/me');
        if (me?.user) return;
        // The API answers a stale bearer with 200 and no user, not 401: treat it the same.
        await sessionStore.setToken(null);
      } catch (err) {
        // apiFetch already dropped the token on a 401; any other failure keeps it for later.
        if (!(err instanceof ApiClientError && err.status === 401)) return;
      }
    }
    await zaloHandshake(platform);
  } catch {
    // Boot goes on as a guest.
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx (no access, not found…) answers the same the second time.
      retry: (failures, error) =>
        failures < 1 && !(error instanceof ApiClientError && error.status >= 400 && error.status < 500),
      refetchOnWindowFocus: true,
    },
  },
});

/** The whole app with its providers; each shell renders this inside its own root. */
export function AppRoot({
  platform = browserPlatform,
  basename,
}: {
  platform?: PlatformBridge;
  basename?: string;
} = {}) {
  return (
    <PlatformProvider platform={platform}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={basename}>
          <NavHistoryProvider>
            <App />
          </NavHistoryProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </PlatformProvider>
  );
}
