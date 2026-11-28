import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CountedSpendRow, EventView, WalletDetailView } from '@cc/core';
import { EventExistingSheet } from '../components/events/EventExistingSheet';
import { EventForm } from '../components/events/EventForm';
import { EventsScreen } from '../screens/EventsScreen';

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const sampleWallet: WalletDetailView = {
  id: 'w-vnd',
  name: 'Cash',
  currency: 'VND',
  balance: 1_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 1_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 1_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 1,
  excludeFromReports: false,
};

const doneTrip: EventView = {
  id: 'tr-done',
  tagId: 'tag-done',
  name: 'Sapa Oct',
  start: '2026-10-01',
  end: '2026-10-05',
  countsFrom: '2026-09-25',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('trip mode final fixes (screens)', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('EventExistingSheet counts n from ownIds + shareRootIds and sends exact ids on Yes', async () => {
    let postedBody: unknown = null;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/me/personal/events/tr-1/existing') && init?.method === 'POST') {
        postedBody = JSON.parse(String(init.body));
        return jsonRes({ tagged: 3 });
      }
      return jsonRes({});
    }) as typeof fetch;

    const onDone = vi.fn();
    render(
      <QueryClientProvider client={makeClient()}>
        <MemoryRouter>
          <EventExistingSheet
            eventId="tr-1"
            existing={{
              own: { count: 2, totals: [{ currency: 'VND', amount: 300_000 }] },
              shares: { count: 1, total: 150_000 },
              ownIds: ['e-1', 'e-2'],
              shareRootIds: ['r-1'],
            }}
            onDone={onDone}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const yesBtn = screen.getByTestId('event-existing-yes');
    expect(yesBtn).toHaveTextContent('Tag all 3 items');

    fireEvent.click(yesBtn);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(postedBody).toEqual({
      tag: true,
      ownIds: ['e-1', 'e-2'],
      shareRootIds: ['r-1'],
    });
  });

  it('EventsScreen shows Skeleton while pending and real total from /events/:id/rows with no local copy and no budgets', async () => {
    let resolveRows!: (res: Response) => void;
    const rowsPromise = new Promise<Response>((resolve) => {
      resolveRows = resolve;
    });

    const serverRows: CountedSpendRow[] = [
      {
        id: 'row-1',
        kind: 'entry',
        date: '2026-10-02',
        amount: 450_000,
        currency: 'VND',
        vnd: 450_000,
        walletId: 'w-vnd',
        categoryId: 'cat-food',
        tagIds: ['tag-done'],
      },
    ];

    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/me/personal/events/tr-done/rows')) {
        return rowsPromise;
      }
      if (url.endsWith('/api/me/personal/events')) {
        return Promise.resolve(jsonRes({ events: [doneTrip] }));
      }
      if (url.includes('/api/me/personal/wallets')) {
        return Promise.resolve(jsonRes({ wallets: [sampleWallet] }));
      }
      if (url.includes('/api/me/personal/budgets/progress')) {
        return Promise.resolve(jsonRes({ rows: [] }));
      }
      if (url.includes('/api/me/personal/budgets')) {
        return Promise.resolve(jsonRes({ budgets: [] }));
      }
      if (url.includes('/api/me/personal/categories')) {
        return Promise.resolve(jsonRes({ categories: [], recentIds: [] }));
      }
      if (url.includes('/api/me/personal/tags')) {
        return Promise.resolve(jsonRes({ tags: [] }));
      }
      return Promise.resolve(jsonRes({}));
    }) as typeof fetch;

    render(
      <QueryClientProvider client={makeClient()}>
        <MemoryRouter>
          <EventsScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const row = await screen.findByTestId('event-row-tr-done');
    // While /rows is pending, show Skeleton and never "0₫"
    expect(row.querySelector('.fsl-skeleton')).not.toBeNull();
    expect(row.textContent).not.toContain('0₫');

    // Resolve /events/tr-done/rows with real total
    resolveRows(jsonRes({ rows: serverRows }));

    await waitFor(() => {
      expect(row.querySelector('.fsl-skeleton')).toBeNull();
      expect(row.textContent).toContain('450.000₫');
    });
  });

  it('EventForm enforces 30-char name limit and never shows raw group ids while loading or for left groups', async () => {
    let resolveGroups!: (res: Response) => void;
    const groupsPromise = new Promise<Response>((resolve) => {
      resolveGroups = resolve;
    });

    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/trips')) {
        return groupsPromise;
      }
      if (url.includes('/api/me/personal/wallets')) {
        return Promise.resolve(jsonRes({ wallets: [sampleWallet] }));
      }
      if (url.includes('/api/me/personal/tags')) {
        return Promise.resolve(jsonRes({ tags: [] }));
      }
      return Promise.resolve(jsonRes({}));
    }) as typeof fetch;

    const editTrip: EventView = {
      ...doneTrip,
      id: 'tr-edit',
      groupIds: ['grp-secret-raw-id'],
    };

    render(
      <QueryClientProvider client={makeClient()}>
        <MemoryRouter>
          <EventForm open onClose={() => {}} event={editTrip} onSaved={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 30-char limit on name input and submit button
    const nameInput = screen.getByTestId('event-form-name') as HTMLInputElement;
    expect(nameInput.maxLength).toBe(30);

    fireEvent.change(nameInput, { target: { value: 'a'.repeat(31) } });
    expect(screen.getByTestId('event-form-submit')).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: 'a'.repeat(30) } });
    expect(screen.getByTestId('event-form-submit')).not.toBeDisabled();

    // While groups load: chip shows Skeleton placeholder, never raw group id
    const chip = screen.getByTestId('event-form-group-chip-grp-secret-raw-id');
    expect(chip.textContent).not.toContain('grp-secret-raw-id');
    expect(chip.querySelector('.fsl-skeleton')).not.toBeNull();

    // After groups load without that id: shows generic left-group label, never raw id
    resolveGroups(jsonRes([]));
    await waitFor(() => {
      expect(chip.textContent).toContain('Left group');
      expect(chip.textContent).not.toContain('grp-secret-raw-id');
    });
  });
});
