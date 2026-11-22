import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { PERSONAL_LIST_KEY } from '@cc/web-data-access/personalMoney';
import type { CategoryView, EntryView, ListResponse, WalletDetailView } from '@cc/core';
import { todayLocal } from '@cc/web-util/localDate';
import { renderAt, mockApi } from '../../test/render';
import { mockMedia } from '../../test/media';
import { NavHistoryProvider } from '../../lib/navHistory';
import { App } from '../../App';
import { TransactionDetail } from '../TransactionDetail';
import { hideUndo } from '../../components/UndoSnackbarHost';

beforeEach(() => {
  localStorage.clear();
  hideUndo();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
});

const meOn = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: true,
};

const activeWallet: WalletDetailView = {
  id: 'w-active',
  name: 'Ví chính',
  kind: 'everyday',
  currency: 'VND',
  balance: 1_000_000,
  startAmount: 1_000_000,
  startDate: '2026-11-01',
  startCostVnd: null,
  vndValue: 1_000_000,
  icon: 'bg-avatar-1',
  sortOrder: 0,
  archived: false,
  isDefault: true,
  entryCount: 1,
};

const archivedWallet: WalletDetailView = {
  id: 'w-archived',
  name: 'Ví cũ',
  kind: 'everyday',
  currency: 'VND',
  balance: 500_000,
  startAmount: 500_000,
  startDate: '2026-11-01',
  startCostVnd: null,
  vndValue: 500_000,
  icon: 'bg-avatar-2',
  sortOrder: 1,
  archived: true,
  isDefault: false,
  entryCount: 1,
};

const categories: CategoryView[] = [
  {
    id: 'cat-food',
    parentId: null,
    type: 'expense',
    name: 'Ăn uống',
    icon: 'utensils',
    hidden: false,
    sortOrder: 0,
  },
];

describe('Personal money final fixes', () => {
  it('EntryPage with no active wallet shows EmptyState with link to /wallets', async () => {
    mockMedia();
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/wallets': { wallets: [archivedWallet] },
      'GET /api/me/personal/categories': { categories },
      'GET /api/me/personal/tags': { tags: [] },
    });

    renderAt(<App />, { route: '/entries/new' });

    const btn = await screen.findByTestId('entry-go-to-wallets');
    expect(btn).toBeInTheDocument();
    expect(btn.closest('a')).toHaveAttribute('href', '/wallets');
    expect(screen.queryByTestId('keypad-done')).not.toBeInTheDocument();
  });

  it('EntryPage editing a transfer from a wallet-filtered cache fetches unfiltered month for counterpart', async () => {
    mockMedia();
    const outEntry: EntryView = {
      id: 'e-tr-out',
      walletId: activeWallet.id,
      type: 'transfer_out',
      amount: 200_000,
      currency: 'VND',
      categoryId: null,
      transferId: 'tr-1',
      counterpartWalletId: 'w-second',
      date: '2026-11-16',
      time: null,
      note: 'Chuyển',
      tags: [],
      excludeFromReports: true,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-16T10:00:00.000Z',
    };
    const inEntry: EntryView = {
      ...outEntry,
      id: 'e-tr-in',
      walletId: 'w-second',
      type: 'transfer_in',
      counterpartWalletId: activeWallet.id,
    };
    const secondWallet: WalletDetailView = {
      ...activeWallet,
      id: 'w-second',
      name: 'Ví phụ',
      isDefault: false,
    };

    const txUrls: string[] = [];
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/wallets': { wallets: [activeWallet, secondWallet] },
      'GET /api/me/personal/categories': { categories },
      'GET /api/me/personal/tags': { tags: [] },
      'GET /api/me/personal/transactions': (_init: RequestInit | undefined, url: string) => {
        txUrls.push(url);
        return Response.json({
          rows: [
            { kind: 'entry', entry: outEntry },
            { kind: 'entry', entry: inEntry },
          ],
          totals: [],
        });
      },
    });

    setLang('en');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Pre-populate cache with wallet-filtered list (only outEntry, no counterpart)
    qc.setQueryData<ListResponse>([...PERSONAL_LIST_KEY, { month: '2026-11', walletId: activeWallet.id }], {
      rows: [{ kind: 'entry', entry: outEntry }],
      totals: [],
    });

    render(
      <PlatformProvider platform={browserPlatform}>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/entries/e-tr-out/edit']}>
            <NavHistoryProvider>
              <App />
            </NavHistoryProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </PlatformProvider>,
    );

    await waitFor(() => {
      const unfilteredCall = txUrls.find(
        (u) => u.includes('month=2026-11') && !u.includes('walletId='),
      );
      expect(unfilteredCall).toBeDefined();
    });
    expect(await screen.findByTestId('entry-to-wallet-row')).toHaveTextContent('Ví phụ');
  });

  it('TransactionDetail prefers refreshed cache over stale router state entry', async () => {
    mockMedia();
    const staleEntry: EntryView = {
      id: 'e-det-1',
      walletId: activeWallet.id,
      type: 'expense',
      amount: 25_000,
      currency: 'VND',
      categoryId: 'cat-food',
      transferId: null,
      counterpartWalletId: null,
      date: '2026-11-16',
      time: null,
      note: 'Stale note',
      tags: [],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-16T10:00:00.000Z',
    };
    const freshEntry: EntryView = {
      ...staleEntry,
      amount: 99_000,
      note: 'Fresh cached note',
    };

    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/wallets': { wallets: [activeWallet] },
      'GET /api/me/personal/categories': { categories },
    });

    setLang('en');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData<ListResponse>([...PERSONAL_LIST_KEY, { month: '2026-11' }], {
      rows: [{ kind: 'entry', entry: freshEntry }],
      totals: [],
    });

    render(
      <PlatformProvider platform={browserPlatform}>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[{ pathname: '/transactions/e-det-1', state: { entry: staleEntry } }]}>
            <NavHistoryProvider>
              <Routes>
                <Route path="/transactions/:id" element={<TransactionDetail />} />
              </Routes>
            </NavHistoryProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </PlatformProvider>,
    );

    expect(await screen.findByText('Fresh cached note')).toBeInTheDocument();
    expect(screen.queryByText('Stale note')).not.toBeInTheDocument();
  });

  it('TransactionsScreen with date-range filter sends only from+to without month and renders a single block', async () => {
    mockMedia();
    const txUrls: string[] = [];
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/wallets': { wallets: [activeWallet] },
      'GET /api/me/personal/categories': { categories },
      'GET /api/me/personal/tags': { tags: [] },
      'GET /api/me/personal/transactions': (_init: RequestInit | undefined, url: string) => {
        txUrls.push(url);
        return Response.json({ rows: [], totals: [] });
      },
    });

    renderAt(<App />, { route: '/transactions?month=2026-11&from=2026-11-05' });

    await waitFor(() => {
      expect(txUrls.length).toBeGreaterThan(0);
      for (const u of txUrls) {
        expect(u).not.toContain('month=');
        expect(u).toContain('from=2026-11-05');
        expect(u).toContain(`to=${todayLocal()}`);
      }
    });

    expect(screen.queryByTestId('tx-load-older')).not.toBeInTheDocument();
  });

  it('TransactionsScreen stops auto-loading after 3 consecutive empty months while keeping manual load-older button', async () => {
    mockMedia();
    let observerCallback: IntersectionObserverCallback | null = null;
    class MockIntersectionObserver {
      private cb: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb;
        observerCallback = cb;
      }
      observe() {}
      disconnect() {
        if (observerCallback === this.cb) {
          observerCallback = null;
        }
      }
      unobserve() {}
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    const txUrls: string[] = [];
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/wallets': { wallets: [activeWallet] },
      'GET /api/me/personal/categories': { categories },
      'GET /api/me/personal/tags': { tags: [] },
      'GET /api/me/personal/transactions': (_init: RequestInit | undefined, url: string) => {
        txUrls.push(url);
        return Response.json({ rows: [], totals: [] });
      },
    });

    renderAt(<App />, { route: '/transactions?month=2026-11' });

    const triggerIntersection = async () => {
      await act(async () => {
        observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      });
    };

    // Wait for initial month 2026-11 to settle and observer to attach
    await waitFor(() => expect(txUrls.some((u) => u.includes('month=2026-11'))).toBe(true));
    await waitFor(() => expect(observerCallback).not.toBeNull());

    // Trigger auto-load: 2026-10, 2026-09, and at 3 trailing empty months (2026-11, 2026-10, 2026-09) it must stop
    await triggerIntersection();
    await waitFor(() => expect(txUrls.some((u) => u.includes('month=2026-10'))).toBe(true));
    await waitFor(() => expect(observerCallback).not.toBeNull());

    await triggerIntersection();
    await waitFor(() => expect(txUrls.some((u) => u.includes('month=2026-09'))).toBe(true));
    await waitFor(() => expect(observerCallback).toBeNull());

    // Now 3 consecutive empty months are loaded -> further intersections must NOT auto-load 2026-08
    await triggerIntersection();
    expect(txUrls.some((u) => u.includes('month=2026-08'))).toBe(false);

    // Manual button is still present
    expect(screen.getByTestId('tx-load-older')).toBeInTheDocument();
  });
});
