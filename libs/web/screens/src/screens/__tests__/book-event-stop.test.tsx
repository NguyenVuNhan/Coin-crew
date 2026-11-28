import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CategoryView,
  EventView,
  TagView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { App } from '../../App';

vi.mock('@cc/web-util/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-util/localDate')>();
  return {
    ...actual,
    todayLocal: () => '2026-11-26',
  };
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  setLang('en');
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

const categories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
];

const tags: TagView[] = [
  { id: 'tag-dalat', name: 'dalat-251126-271126', useCount: 1 },
  { id: 'tag-tet', name: 'muasamtet-261126', useCount: 1 },
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

type Routes = Parameters<typeof mockApi>[0];

function mockApp(events: EventView[], extra?: Routes) {
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': { settings: { defaultGroupCategoryId: null, countLoans: false } },
    'GET /api/me/personal/transactions': { rows: [], totals: [] },
    'GET /api/me/personal/budgets': { budgets: [] },
    'GET /api/me/personal/budgets/progress': { rows: [], today: '2026-11-26' },
    'GET /api/me/personal/events': { events },
    'POST /api/me/personal/events/tag-shares': { tagged: 0 },
    ...extra,
  });
}

describe('BookEventRow stop action', () => {
  it('single running event shows stop button that opens confirm modal without navigating, then stops on confirm', async () => {
    const user = userEvent.setup();
    const api = mockApp([evDaLat], {
      'POST /api/me/personal/events/ev-dalat/stop': () =>
        Response.json({
          event: {
            ...evDaLat,
            end: '2026-11-26',
            stoppedAt: '2026-11-26T09:00:00.000Z',
          },
        }),
    });

    renderAt(<App />, { route: '/trips' });
    act(() => setLang('vi', false));

    const stopBtn = await screen.findByTestId('book-event-stop');
    expect(stopBtn).toHaveTextContent('Dừng');
    expect(stopBtn).toHaveAttribute('aria-label', 'Dừng Đà Lạt');
    expect(stopBtn).toHaveClass('min-h-11');

    await user.click(stopBtn);

    // Confirm modal opens and we are still on Sổ chi tiêu (row still mounted, did not navigate to detail)
    const modal = await screen.findByTestId('event-stop-confirm-modal');
    expect(modal).toHaveTextContent(
      'Dừng Đà Lạt từ bây giờ? Khoản chi mới sẽ không được gắn tag nữa.',
    );
    expect(screen.getByTestId('book-event-row')).toBeInTheDocument();
    expect(api.calls.filter((c) => c.path.endsWith('/stop'))).toHaveLength(0);

    await user.click(within(modal).getByTestId('event-stop-confirm'));

    await waitFor(() => {
      const stopCall = api.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/events/ev-dalat/stop',
      );
      expect(stopCall?.body).toEqual({ today: '2026-11-26' });
    });
  });

  it('2+ running events show no stop button', async () => {
    mockApp([evDaLat, evTetOpen]);
    renderAt(<App />, { route: '/trips' });
    act(() => setLang('vi', false));

    const row = await screen.findByTestId('book-event-row');
    await waitFor(() => {
      expect(within(row).getByText('2 sự kiện đang diễn ra · Đà Lạt, Mua sắm Tết')).toBeInTheDocument();
    });
    expect(row).toHaveAttribute('href', '/events');
    expect(screen.queryByTestId('book-event-stop')).not.toBeInTheDocument();
  });
});
