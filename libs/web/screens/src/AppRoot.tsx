import { BrowserRouter } from 'react-router';
import { DEFAULT_THEME, type MeResponse } from '@cc/core';
import { applyTheme, readCachedTheme } from '@cc/web-ui/lib/theme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { NavHistoryProvider } from './lib/navHistory';
import { detectLang, setLang } from '@cc/web-i18n';
import { refetchOnWindowFocus } from '@cc/web-data-access/focus';
import { ApiClientError, apiFetch } from '@cc/web-data-access/client';
import { browserPlatform, PlatformProvider, type PlatformBridge } from '@cc/web-platform';
import { sessionStore } from '@cc/web-platform/session';
import { zaloHandshake } from '@cc/web-data-access/zaloSession';
import { SIGNED_OUT_KEY } from '@cc/web-data-access/signOut';

/** One-time start-up shared by every shell (web, Zalo): the cached theme, language and focus refetch. */
export async function bootApp(platform: PlatformBridge = browserPlatform): Promise<void> {
  // First, before any await: a slow Zalo handshake must never delay the person's colours.
  applyTheme(readCachedTheme() ?? DEFAULT_THEME);
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
    // After "Sign out" the Mini App stays signed out until the person signs in with Zalo again.
    if ((await platform.storage.get(SIGNED_OUT_KEY)) === '1') return;
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
