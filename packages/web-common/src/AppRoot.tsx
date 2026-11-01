import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { NavHistoryProvider } from './lib/navHistory';
import { detectLang, setLang } from './i18n';
import { refetchOnWindowFocus } from './api/focus';
import { ApiClientError } from './api/client';

/** One-time start-up shared by every shell (web, Zalo): language and focus refetch. */
export function bootApp(): void {
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
export function AppRoot() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NavHistoryProvider>
          <App />
        </NavHistoryProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
