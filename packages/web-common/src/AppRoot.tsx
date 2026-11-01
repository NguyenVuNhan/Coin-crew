import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { NavHistoryProvider } from './lib/navHistory';
import { detectLang, setLang } from './i18n';
import { refetchOnWindowFocus } from './api/focus';
import { ApiClientError } from './api/client';
import { browserPlatform, PlatformProvider, type PlatformBridge } from './platform';
import { sessionStore } from './platform/session';

/** One-time start-up shared by every shell (web, Zalo): language and focus refetch. */
export async function bootApp(platform: PlatformBridge = browserPlatform): Promise<void> {
  await sessionStore.init(platform);
  setLang(detectLang());
  refetchOnWindowFocus();
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
