import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
  eventsForDate,
  type CategoriesResponse,
  type CategoryView,
  type EntryView,
  type EventView,
  type TagView,
  type TripView,
  type WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { mockMedia } from '../../test/media';
import { finishAmount, openDetails } from '../../test/entry';
import { NavHistoryProvider } from '../../lib/navHistory';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';
import { App } from '../../App';
import {
  EntryPage,
  applyEventTagIds,
  applyEventTagNames,
  eventRowTagState,
} from '../EntryPage';

let mockToday = '2026-11-26';

vi.mock('@cc/web-util/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-util/localDate')>();
  return {
    ...actual,
    todayLocal: () => mockToday,
    currentMonthLocal: () => mockToday.slice(0, 7),
  };
});

const meOn = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: true,
};

const ledger = { tripId: 't-led', ownerPid: 'p-me' };
const peopleSummary = { people: [], incomplete: false };

function ledgerView(): TripView {
  return tripView({
    trip: {
      id: 't-led',
      name: 'Quick expenses',
      currency: 'VND',
      fewestTransfers: true,
      archived: false,
      version: 1,
      total: 0,
    },
    me: { kind: 'member', participantId: 'p-me', participantPending: false, isOrganiser: true },
    people: [{ id: 'p-me', name: 'Me', status: 'active', isMember: true, bank: 'approved' }],
    expenses: [],
    payments: [],
  });
}

const cashWallet: WalletDetailView = {
  id: 'w-cash',
  name: 'Tiền mặt',
  currency: 'VND',
  balance: 5_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 5_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 5_000_000,
  icon: 'wallet',
  sortOrder: 0,
  archived: false,
  entryCount: 10,
  excludeFromReports: false,
};

const foodCat: CategoryView = {
  id: 'cat-food',
  parentId: null,
  type: 'expense',
  name: 'Ăn uống',
  icon: 'utensils',
  hidden: false,
  sortOrder: 0,
};

const categoriesResp: CategoriesResponse = {
  categories: [foodCat],
  recentIds: ['cat-food'],
};

const tags: TagView[] = [
  { id: 'tag-dalat', name: 'dalat-251126-271126', useCount: 1 },
  { id: 'tag-tet', name: 'muasamtet-261126', useCount: 1 },
  { id: 'tag-hue', name: 'hue-011226-041226', useCount: 1 },
];

const evDaLat: EventView = {
  id: 'ev-dalat',
  tagId: 'tag-dalat',
  tagName: 'dalat-251126-271126',
  name: 'Đà Lạt',
  start: '2026-11-25',
  end: '2026-11-27',
  stoppedAt: null,
  countsFrom: '2026-11-20',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-20T00:00:00.000Z',
};

const evTetOpen: EventView = {
  id: 'ev-tet',
  tagId: 'tag-tet',
  tagName: 'muasamtet-261126',
  name: 'Mua sắm Tết',
  start: '2026-11-26',
  end: null,
  stoppedAt: null,
  countsFrom: '2026-11-26',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-26T00:00:00.000Z',
};

const evHueUpcoming: EventView = {
  id: 'ev-hue',
  tagId: 'tag-hue',
  tagName: 'hue-011226-041226',
  name: 'Huế',
  start: '2026-12-01',
  end: '2026-12-04',
  stoppedAt: null,
  countsFrom: '2026-11-20',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-20T00:00:00.000Z',
};

const evStoppedToday: EventView = {
  id: 'ev-stopped',
  tagId: 'tag-dalat',
  tagName: 'dalat-251126-261126',
  name: 'Đà Lạt',
  start: '2026-11-25',
  end: '2026-11-26',
  stoppedAt: '2026-11-26T08:00:00.000Z',
  countsFrom: '2026-11-20',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-20T00:00:00.000Z',
};

function makeEntryView(overrides: Partial<EntryView> = {}): EntryView {
  return {
    id: 'e-1',
    type: 'expense',
    walletId: 'w-cash',
    currency: 'VND',
    amount: 120_000,
    categoryId: 'cat-food',
    date: mockToday,
    time: '09:00',
    note: null,
    tags: [],
    excludeFromReports: false,
    transferId: null,
    counterpartWalletId: null,
    source: 'manual',
    beforeStart: false,
    createdAt: '2026-11-26T02:00:00Z',
    ...overrides,
  };
}

function setupBookApi(events: EventView[]) {
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/transactions': { rows: [], totals: [] },
    'GET /api/me/personal/budgets': { budgets: [] },
    'GET /api/me/personal/budgets/progress': { rows: [], today: mockToday },
    'GET /api/me/personal/events': { events },
    'POST /api/me/personal/events/tag-shares': { tagged: 0 },
  });
}

function setupEntryApi(events: EventView[], entries: EntryView[] = []) {
  return mockApi({
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/budgets': { budgets: [] },
    'GET /api/me/personal/events': { events },
    'GET /api/me/personal/transactions': {
      rows: entries.map((entry) => ({ kind: 'entry', entry })),
    },
    'POST /api/me/personal/transactions': () =>
      Response.json({ entries: [makeEntryView()] }, { status: 201 }),
    ...Object.fromEntries(
      entries.map((entry) => [
        `PATCH /api/me/personal/transactions/${entry.id}`,
        () => Response.json({ entries: [entry] }, { status: 200 }),
      ]),
    ),
  });
}

function renderEntry(route = '/entries/new?type=expense', state?: unknown) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  const [pathname, search] = route.split('?');
  return render(
    <PlatformProvider platform={browserPlatform}>
      <QueryClientProvider client={qc}>
        <MemoryRouter
          initialEntries={[
            { pathname: '/trips' },
            { pathname, search: search ? `?${search}` : '', state },
          ]}
          initialIndex={1}
        >
          <NavHistoryProvider>
            <UndoSnackbarHost />
            <Routes>
              <Route path="/entries/new" element={<EntryPage />} />
              <Route path="/entries/:id/edit" element={<EntryPage />} />
              <Route path="/trips" element={<div data-testid="trips-route">Trips</div>} />
            </Routes>
          </NavHistoryProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  mockToday = '2026-11-26';
  vi.setSystemTime(new Date('2026-11-26T10:00:00'));
  localStorage.clear();
  hideUndo();
  setLang('vi');
  mockMedia();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
  setLang('en');
});

describe('Multiple events on Sổ chi tiêu and in the expense form', () => {
  it('two running events: book row says 2 sự kiện đang diễn ra with both names', async () => {
    setupBookApi([evTetOpen, evDaLat]);
    renderAt(<App />, { route: '/trips' });
    act(() => setLang('vi'));

    const row = await screen.findByTestId('book-event-row');
    await waitFor(() => {
      expect(within(row).getByText('2 sự kiện đang diễn ra')).toBeInTheDocument();
      expect(within(row).getByText('Đà Lạt, Mua sắm Tết')).toBeInTheDocument();
    });
    expect(row).toHaveAttribute('href', '/events');
    expect(row.querySelector('.fsl-budget-bar')).toBeNull();
  });

  it('single open-ended running event: book row shows day without total', async () => {
    setupBookApi([evTetOpen]);
    renderAt(<App />, { route: '/trips' });
    act(() => setLang('vi'));

    const row = await screen.findByTestId('book-event-row');
    await waitFor(() => {
      expect(row).toHaveAttribute('href', '/events/ev-tet');
    });
    expect(within(row).getByText('Mua sắm Tết đang diễn ra')).toBeInTheDocument();
    expect(within(row).getByText('ngày 1')).toBeInTheDocument();
  });

  it('two running events: form shows two rows, removing one saves only the other tag', async () => {
    const user = userEvent.setup();
    const api = setupEntryApi([evDaLat, evTetOpen]);

    renderEntry();
    const rowDaLat = await screen.findByTestId('entry-event-row-ev-dalat');
    const rowTet = await screen.findByTestId('entry-event-row-ev-tet');
    expect(rowDaLat).toHaveTextContent('Đà Lạt');
    expect(rowTet).toHaveTextContent('Mua sắm Tết');

    await finishAmount(user, '120000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));

    await user.click(screen.getByRole('button', { name: 'Bỏ khỏi Mua sắm Tết' }));
    expect(screen.getByTestId('entry-event-row-ev-tet')).toHaveTextContent('Thêm vào Mua sắm Tết');
    expect(screen.getByTestId('entry-event-row-ev-dalat')).toHaveTextContent('Đà Lạt');

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const post = api.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/transactions',
      );
      expect(post).toBeDefined();
      expect((post?.body as { tags?: string[] }).tags).toEqual(['dalat-251126-271126']);
    });
  });

  it('stopped event gives no row for today', async () => {
    setupEntryApi([evStoppedToday]);

    renderEntry();
    await screen.findByTestId('amount-keypad');
    await waitFor(() => {
      expect(screen.queryByTestId('entry-event-row')).not.toBeInTheDocument();
      expect(screen.queryByTestId('entry-event-row-ev-stopped')).not.toBeInTheDocument();
    });
  });

  it('lead-up of an upcoming event shows as a suggestion next to a running row', async () => {
    const user = userEvent.setup();
    const api = setupEntryApi([evDaLat, evHueUpcoming]);

    renderEntry();
    const runningRow = await screen.findByTestId('entry-event-row-ev-dalat');
    const leadupRow = await screen.findByTestId('entry-event-row-ev-hue');

    expect(runningRow).toHaveTextContent('Đà Lạt');
    expect(within(runningRow).getByRole('button', { name: 'Bỏ khỏi Đà Lạt' })).toBeInTheDocument();
    expect(leadupRow).toHaveTextContent('Thêm vào Huế');

    await finishAmount(user, '250000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));

    await user.click(leadupRow);
    expect(screen.getByTestId('entry-event-row-ev-hue')).toHaveTextContent('Huế');

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const post = api.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/transactions',
      );
      expect(post).toBeDefined();
      expect((post?.body as { tags?: string[] }).tags).toEqual([
        'dalat-251126-271126',
        'hue-011226-041226',
      ]);
    });
  });

  it('hand-picked tag of a lead-up event is kept when its row is left untouched', () => {
    const matches = eventsForDate([evDaLat, evHueUpcoming], '2026-11-26');
    expect(matches.map((m) => [m.event.id, m.mode])).toEqual([
      ['ev-dalat', 'on'],
      ['ev-hue', 'leadup'],
    ]);

    const resolveName = (id: string) =>
      [evDaLat, evHueUpcoming].find((e) => e.id === id)?.tagName ?? null;

    // Untouched lead-up row: must not remove hand-picked tag
    const untouchedOverrides: Record<string, boolean> = {};
    const untouchedIds = applyEventTagIds({
      baseTagIds: ['tag-hue', 'tag-other'],
      matches,
      isOn: (m) =>
        eventRowTagState(m, {
          override: untouchedOverrides[m.event.id],
          isEdit: false,
          hasExistingTag: false,
        }).on,
      shouldRemove: (m) =>
        eventRowTagState(m, {
          override: untouchedOverrides[m.event.id],
          isEdit: false,
          hasExistingTag: false,
        }).shouldRemove,
    });
    expect(untouchedIds).toEqual(['tag-hue', 'tag-other', 'tag-dalat']);

    const untouchedNames = applyEventTagNames({
      baseTagNames: ['hue-011226-041226', 'ca-phe'],
      matches,
      resolveTagName: (m) => resolveName(m.event.id),
      isOn: (m) =>
        eventRowTagState(m, {
          override: untouchedOverrides[m.event.id],
          isEdit: false,
          hasExistingTag: false,
        }).on,
      shouldRemove: (m) =>
        eventRowTagState(m, {
          override: untouchedOverrides[m.event.id],
          isEdit: false,
          hasExistingTag: false,
        }).shouldRemove,
    });
    expect(untouchedNames).toEqual(['hue-011226-041226', 'ca-phe', 'dalat-251126-271126']);

    // Explicitly turned off (override === false): removes the lead-up event's tag
    const turnedOffOverrides: Record<string, boolean> = { 'ev-hue': false };
    const afterTurnOffIds = applyEventTagIds({
      baseTagIds: ['tag-hue', 'tag-other'],
      matches,
      isOn: (m) =>
        eventRowTagState(m, {
          override: turnedOffOverrides[m.event.id],
          isEdit: false,
          hasExistingTag: false,
        }).on,
      shouldRemove: (m) =>
        eventRowTagState(m, {
          override: turnedOffOverrides[m.event.id],
          isEdit: false,
          hasExistingTag: false,
        }).shouldRemove,
    });
    expect(afterTurnOffIds).toEqual(['tag-other', 'tag-dalat']);
  });

  it("edit an entry with both events' tags, turn one row off: the other event's tag and an unrelated tag survive", async () => {
    const user = userEvent.setup();
    const bothEntry = makeEntryView({
      id: 'e-both',
      date: '2026-11-26',
      tags: ['dalat-251126-271126', 'muasamtet-261126', 'ca-phe'],
    });
    const api = setupEntryApi([evDaLat, evTetOpen], [bothEntry]);

    renderEntry('/entries/e-both/edit', { entry: bothEntry });

    const rowDaLat = await screen.findByTestId('entry-event-row-ev-dalat');
    const rowTet = await screen.findByTestId('entry-event-row-ev-tet');
    expect(rowDaLat).toHaveTextContent('Đà Lạt');
    expect(rowTet).toHaveTextContent('Mua sắm Tết');

    await user.click(screen.getByRole('button', { name: 'Bỏ khỏi Mua sắm Tết' }));
    expect(screen.getByTestId('entry-event-row-ev-tet')).toHaveTextContent('Thêm vào Mua sắm Tết');

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const patch = api.calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/personal/transactions/e-both',
      );
      expect(patch).toBeDefined();
      expect((patch?.body as { tags?: string[] }).tags).toEqual([
        'dalat-251126-271126',
        'ca-phe',
      ]);
    });
  });

  it("direct-edit: edit a shared entry with both events' tags, turn one row off: the other event's tag and an unrelated tag survive", async () => {
    const user = userEvent.setup();
    const sharedTripView = tripView({
      trip: {
        id: 't-led',
        name: 'Quick expenses',
        currency: 'VND',
        fewestTransfers: true,
        archived: false,
        version: 1,
        total: 200_000,
      },
      me: { kind: 'member', participantId: 'p-me', participantPending: false, isOrganiser: true },
      people: [
        { id: 'p-me', name: 'Me', status: 'active', isMember: true, bank: 'approved' },
        { id: 'p-minh', name: 'Minh', status: 'active', isMember: false, bank: 'none' },
      ],
      expenses: [
        {
          id: 'exp-both',
          rootId: 'exp-both',
          description: 'Ăn trưa',
          amount: 200_000,
          spentOn: '2026-11-26',
          payerId: 'p-me',
          mode: 'equal',
          status: 'approved',
          rejectReason: null,
          disabledByName: null,
          createdById: 'p-me',
          shares: [
            { participantId: 'p-me', amount: 100_000, inputValue: 1 },
            { participantId: 'p-minh', amount: 100_000, inputValue: 1 },
          ],
        },
      ],
      payments: [],
    });

    const api = mockApi({
      'GET /api/me': meOn,
      'GET /api/me/ledger': ledger,
      'GET /api/trips/t-led': sharedTripView,
      'GET /api/trips/t-led/version': { version: 1 },
      'GET /api/me/personal/wallets': { wallets: [cashWallet] },
      'GET /api/me/personal/categories': categoriesResp,
      'GET /api/me/personal/tags': {
        tags: [...tags, { id: 'tag-other', name: 'ca-phe', useCount: 1 }],
      },
      'GET /api/me/personal/group-settings': {
        settings: { defaultGroupCategoryId: null, countLoans: false },
      },
      'GET /api/me/personal/budgets': { budgets: [] },
      'GET /api/me/personal/events': { events: [evDaLat, evTetOpen] },
      'GET /api/me/personal/transactions': {
        rows: [],
        groupRows: [
          {
            kind: 'group',
            id: 'exp-both',
            rootId: 'exp-both',
            tripId: 't-led',
            tripName: 'Quick expenses',
            isDirect: true,
            source: 'expense',
            date: '2026-11-26',
            title: 'Ăn trưa',
            total: 200_000,
            myShare: 100_000,
            iPaid: true,
            payerName: 'Me',
            counterpartName: null,
            people: ['Minh'],
            pending: false,
            link: {
              walletId: 'w-cash',
              categoryId: 'cat-food',
              tagIds: ['tag-dalat', 'tag-tet', 'tag-other'],
              intent: 'shared',
              excludeFromReports: false,
            },
            createdAt: '2026-11-26T05:00:00Z',
            activityAt: '2026-11-26T05:00:00Z',
          },
        ],
      },
      'PATCH /api/trips/t-led/expenses/exp-both': () =>
        Response.json({ expenseId: 'exp-both-2', rootId: 'exp-both' }),
      'PUT /api/me/personal/group-links/exp-both': () =>
        Response.json({
          link: {
            walletId: 'w-cash',
            categoryId: 'cat-food',
            tagIds: ['tag-dalat', 'tag-other'],
            intent: 'shared',
            excludeFromReports: false,
          },
        }),
    });

    renderEntry('/entries/exp-both/edit?group=1');

    const rowDaLat = await screen.findByTestId('entry-event-row-ev-dalat');
    const rowTet = await screen.findByTestId('entry-event-row-ev-tet');
    expect(rowDaLat).toHaveTextContent('Đà Lạt');
    expect(rowTet).toHaveTextContent('Mua sắm Tết');

    await user.click(screen.getByRole('button', { name: 'Bỏ khỏi Mua sắm Tết' }));
    expect(screen.getByTestId('entry-event-row-ev-tet')).toHaveTextContent('Thêm vào Mua sắm Tết');

    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => {
      const put = api.calls.find(
        (c) => c.method === 'PUT' && c.path === '/api/me/personal/group-links/exp-both',
      );
      expect(put).toBeDefined();
      expect((put?.body as { tagIds?: string[] }).tagIds).toEqual(['tag-dalat', 'tag-other']);
    });
  });

  it("removing Đà Lạt then moving the date into Tết's lead-up keeps Đà Lạt off", async () => {
    const user = userEvent.setup();
    const evTetLeadup: EventView = {
      id: 'ev-tet-lead',
      tagId: 'tag-tet',
      tagName: 'muasamtet-051226',
      name: 'Tết',
      start: '2026-12-05',
      end: '2026-12-10',
      stoppedAt: null,
      countsFrom: '2026-11-27',
      groupIds: [],
      budgetId: null,
      createdAt: '2026-11-26T00:00:00.000Z',
    };

    const api = setupEntryApi([evDaLat, evTetLeadup]);
    renderEntry();

    // On 2026-11-26, only Đà Lạt matches (on)
    const rowDaLat = await screen.findByTestId('entry-event-row');
    expect(rowDaLat).toHaveTextContent('Đà Lạt');
    expect(screen.queryByTestId('entry-event-row-ev-tet-lead')).not.toBeInTheDocument();

    await finishAmount(user, '120000');
    await user.click(await screen.findByTestId('category-tile-cat-food'));

    // Turn Đà Lạt off
    await user.click(screen.getByRole('button', { name: 'Bỏ khỏi Đà Lạt' }));
    expect(screen.getByTestId('entry-event-row')).toHaveTextContent('Thêm vào Đà Lạt');

    // Move date to 2026-11-27 (still during Đà Lạt, now also in Tết's lead-up)
    if (!screen.queryByTestId('entry-date-overlay-value')) {
      await openDetails(user);
    }
    const datePicker = await screen.findByTestId('entry-date-overlay-value');
    fireEvent.change(datePicker, { target: { value: '2026-11-27' } });

    // Tết lead-up appears, and Đà Lạt stays off
    const rowTet = await screen.findByTestId('entry-event-row-ev-tet-lead');
    expect(rowTet).toHaveTextContent('Thêm vào Tết');
    expect(screen.getByTestId('entry-event-row-ev-dalat')).toHaveTextContent('Thêm vào Đà Lạt');

    // Saving does NOT include Đà Lạt's tag
    await user.click(screen.getByTestId('entry-save-btn'));
    await waitFor(() => {
      const post = api.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/transactions',
      );
      expect(post).toBeDefined();
      expect((post?.body as { tags?: string[] }).tags ?? []).toEqual([]);
    });
  });
});
