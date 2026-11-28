import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  BudgetDef,
  CategoryView,
  CountedSpendRow,
  EventSavedResponse,
  EventView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { App } from '../../App';
import { EventForm } from '../../components/events/EventForm';

vi.mock('@cc/web-util/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-util/localDate')>();
  return {
    ...actual,
    todayLocal: () => '2026-11-13',
  };
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
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
  balance: 10_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 10_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 10_000_000,
  icon: 'wallet',
  sortOrder: 0,
  archived: false,
  entryCount: 10,
  excludeFromReports: false,
};

const categories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
];

function stubApis(opts: {
  events?: EventView[];
  budgets?: BudgetDef[];
  rows?: CountedSpendRow[];
  extraRoutes?: Record<string, unknown>;
} = {}) {
  const { events = [], budgets = [], rows = [], extraRoutes = {} } = opts;
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/events': { events },
    'GET /api/me/personal/budgets': { budgets },
    'GET /api/me/personal/budgets/progress': { today: '2026-11-13', rows },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags: [] },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/groups': { items: [] },
    'GET /api/me/ledger': ledger,
    'GET /api/me/people': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips': [],
    ...extraRoutes,
  });
}

function renderVi(route: string) {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('Event lifecycle & optional dates', () => {
  it('form with only a name saves start=today, end=null', async () => {
    const user = userEvent.setup();
    const saved: EventSavedResponse = {
      event: {
        id: 'ev-1',
        tagId: 'tag-1',
        tagName: 'dalat-131126',
        name: 'Đà Lạt',
        start: '2026-11-13',
        end: null,
        stoppedAt: null,
        countsFrom: '2026-11-13',
        groupIds: [],
        budgetId: null,
        createdAt: '2026-11-13T00:00:00.000Z',
      },
      existing: {
        own: { count: 0, totals: [] },
        shares: { count: 0, total: 0 },
      },
    };

    const api = stubApis({
      extraRoutes: {
        'POST /api/me/personal/events': () => Response.json(saved, { status: 201 }),
      },
    });

    const onSaved = vi.fn();
    renderAt(<EventForm open onClose={vi.fn()} onSaved={onSaved} />, { route: '/events', path: '*' });
    act(() => {
      setLang('vi', false);
    });

    await user.type(await screen.findByTestId('event-form-name'), 'Đà Lạt');
    const submit = screen.getByTestId('event-form-submit');
    expect(submit).not.toBeDisabled();
    await user.click(submit);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    const postCall = api.calls.find(
      (c) => c.method === 'POST' && c.path === '/api/me/personal/events',
    );
    expect(postCall?.body).toMatchObject({
      name: 'Đà Lạt',
      start: '2026-11-13',
      end: null,
      countsFrom: '2026-11-13',
      today: '2026-11-13',
    });
  });

  it('limit field hidden until end set, hint shown', async () => {
    stubApis();
    renderAt(<EventForm open onClose={vi.fn()} onSaved={vi.fn()} />, { route: '/events', path: '*' });
    act(() => {
      setLang('vi', false);
    });

    await screen.findByTestId('event-form');
    expect(screen.queryByTestId('event-form-limit')).not.toBeInTheDocument();
    expect(screen.getByTestId('event-form-limit-needs-end')).toHaveTextContent(
      'Đặt ngày kết thúc để đặt hạn mức',
    );

    fireEvent.change(screen.getByTestId('event-form-end'), { target: { value: '2026-11-20' } });
    expect(screen.getByTestId('event-form-limit')).toBeInTheDocument();
    expect(screen.queryByTestId('event-form-limit-needs-end')).not.toBeInTheDocument();
  });

  it('clearing end with a limit asks first', async () => {
    const user = userEvent.setup();
    const eventWithBudget: EventView = {
      id: 'ev-b',
      tagId: 'tag-b',
      tagName: 'dalat-121126-141126',
      name: 'Đà Lạt',
      start: '2026-11-12',
      end: '2026-11-14',
      stoppedAt: null,
      countsFrom: '2026-11-05',
      groupIds: [],
      budgetId: 'b-dl',
      createdAt: '2026-11-05T00:00:00.000Z',
    };
    const dlBudget: BudgetDef = {
      id: 'b-dl',
      name: 'Đà Lạt',
      target: { kind: 'tag', tagId: 'tag-b' },
      currency: 'VND',
      periodKind: 'once',
      monthStartDay: null,
      from: '2026-11-05',
      to: '2026-11-14',
      excludedWalletIds: [],
      limits: [{ effectiveFrom: '2026-11-05', amount: 5_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: '2026-11-05',
    };

    const api = stubApis({
      events: [eventWithBudget],
      budgets: [dlBudget],
      extraRoutes: {
        'PATCH /api/me/personal/events/ev-b': () =>
          Response.json({
            event: { ...eventWithBudget, end: null, budgetId: null },
            existing: { own: { count: 0, totals: [] }, shares: { count: 0, total: 0 } },
          }),
      },
    });

    const onSaved = vi.fn();
    renderAt(<EventForm open onClose={vi.fn()} event={eventWithBudget} onSaved={onSaved} />, {
      route: '/events/ev-b',
      path: '*',
    });
    act(() => {
      setLang('vi', false);
    });

    await screen.findByTestId('event-form');
    fireEvent.change(screen.getByTestId('event-form-end'), { target: { value: '' } });
    await user.click(screen.getByTestId('event-form-submit'));

    // Should ask before sending PATCH
    const modal = await screen.findByTestId('event-clear-end-confirm');
    expect(modal).toHaveTextContent('Bỏ ngày kết thúc sẽ xóa hạn mức. Tiếp tục?');
    expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);

    await user.click(within(modal).getByTestId('event-form-clear-end-confirm'));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
    const patchCall = api.calls.find(
      (c) => c.method === 'PATCH' && c.path === '/api/me/personal/events/ev-b',
    );
    expect(patchCall?.body).toMatchObject({ end: null, limit: null });
  });

  it('stop asks then calls stop', async () => {
    const user = userEvent.setup();
    const onEvent: EventView = {
      id: 'ev-on',
      tagId: 'tag-on',
      tagName: 'dalat-121126',
      name: 'Đà Lạt',
      start: '2026-11-12',
      end: null,
      stoppedAt: null,
      countsFrom: '2026-11-12',
      groupIds: [],
      budgetId: null,
      createdAt: '2026-11-12T00:00:00.000Z',
    };

    const api = stubApis({
      events: [onEvent],
      extraRoutes: {
        'POST /api/me/personal/events/ev-on/stop': () =>
          Response.json({
            event: {
              ...onEvent,
              end: '2026-11-13',
              stoppedAt: '2026-11-13T10:00:00.000Z',
            },
          }),
      },
    });

    renderVi('/events/ev-on');

    // Open-ended running event shows day line without total and tag name in meta
    expect(await screen.findByTestId('event-day-line')).toHaveTextContent('ngày 2');
    expect(screen.getByTestId('event-tag-name')).toHaveTextContent('#dalat-121126');

    const stopBtn = screen.getByTestId('event-stop-button');
    expect(stopBtn).toHaveTextContent('Dừng');
    await user.click(stopBtn);

    const modal = await screen.findByTestId('event-stop-confirm-modal');
    expect(modal).toHaveTextContent(
      'Dừng Đà Lạt từ bây giờ? Khoản chi mới sẽ không được gắn tag nữa.',
    );
    expect(api.calls.filter((c) => c.path.endsWith('/stop'))).toHaveLength(0);

    await user.click(within(modal).getByTestId('event-stop-confirm'));

    await waitFor(() => {
      const call = api.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/events/ev-on/stop',
      );
      expect(call?.body).toEqual({ today: '2026-11-13' });
    });
  });

  it('resume shows the existing sheet with the gap', async () => {
    const user = userEvent.setup();
    const stoppedEvent: EventView = {
      id: 'ev-stop',
      tagId: 'tag-stop',
      tagName: 'dalat-101126-111126',
      name: 'Đà Lạt',
      start: '2026-11-10',
      end: '2026-11-11',
      stoppedAt: '2026-11-11T12:00:00.000Z',
      countsFrom: '2026-11-10',
      groupIds: [],
      budgetId: 'b-stop',
      createdAt: '2026-11-10T00:00:00.000Z',
    };

    const resumeRes: EventSavedResponse = {
      event: {
        ...stoppedEvent,
        end: null,
        stoppedAt: null,
        budgetId: null,
        tagName: 'dalat-101126',
      },
      existing: {
        own: { count: 2, totals: [{ currency: 'VND', amount: 450_000 }] },
        shares: { count: 1, total: 150_000 },
        ownIds: ['e-1', 'e-2'],
        shareRootIds: ['s-1'],
      },
    };

    const api = stubApis({
      events: [stoppedEvent],
      extraRoutes: {
        'POST /api/me/personal/events/ev-stop/resume': () => Response.json(resumeRes),
        'POST /api/me/personal/events/ev-stop/existing': () => Response.json({ tagged: 3 }),
      },
    });

    renderVi('/events/ev-stop');

    const resumeBtn = await screen.findByTestId('event-resume-button');
    expect(resumeBtn).toHaveTextContent('Tiếp tục');
    await user.click(resumeBtn);

    const modal = await screen.findByTestId('event-resume-confirm-modal');
    expect(modal).toHaveTextContent('Tiếp tục Đà Lạt?');
    expect(modal).toHaveTextContent('Hạn mức sẽ bị bỏ vì sự kiện không còn ngày kết thúc.');

    await user.click(within(modal).getByTestId('event-resume-confirm'));

    await waitFor(() => {
      expect(
        api.calls.some(
          (c) => c.method === 'POST' && c.path === '/api/me/personal/events/ev-stop/resume',
        ),
      ).toBe(true);
    });

    const sheet = await screen.findByTestId('event-existing-sheet');
    expect(within(sheet).getByText(/2 khoản bạn tự chi/)).toBeInTheDocument();
    expect(within(sheet).getByText(/1 phần trong nhóm/)).toBeInTheDocument();
  });

  it('start now on upcoming', async () => {
    const user = userEvent.setup();
    const upcomingEvent: EventView = {
      id: 'ev-up',
      tagId: 'tag-up',
      tagName: 'hue-181126-211126',
      name: 'Huế',
      start: '2026-11-18',
      end: '2026-11-21',
      stoppedAt: null,
      countsFrom: '2026-11-13',
      groupIds: [],
      budgetId: null,
      createdAt: '2026-11-13T00:00:00.000Z',
    };

    const startNowRes: EventSavedResponse = {
      event: {
        ...upcomingEvent,
        start: '2026-11-13',
        tagName: 'hue-131126-211126',
      },
      existing: {
        own: { count: 1, totals: [{ currency: 'VND', amount: 200_000 }] },
        shares: { count: 0, total: 0 },
        ownIds: ['e-today'],
        shareRootIds: [],
      },
    };

    const api = stubApis({
      events: [upcomingEvent],
      extraRoutes: {
        'POST /api/me/personal/events/ev-up/start-now': () => Response.json(startNowRes),
        'POST /api/me/personal/events/ev-up/existing': () => Response.json({ tagged: 1 }),
      },
    });

    renderVi('/events/ev-up');

    const startNowBtn = await screen.findByTestId('event-start-now-button');
    expect(startNowBtn).toHaveTextContent('Bắt đầu ngay');
    await user.click(startNowBtn);

    await waitFor(() => {
      const call = api.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/events/ev-up/start-now',
      );
      expect(call?.body).toEqual({ today: '2026-11-13' });
    });

    const sheet = await screen.findByTestId('event-existing-sheet');
    expect(within(sheet).getByText(/1 khoản bạn tự chi/)).toBeInTheDocument();
  });

  it('view report link uses countsFrom..end', async () => {
    const fixedEndEvent: EventView = {
      id: 'ev-rep',
      tagId: 'tag-rep',
      tagName: 'dalat-121126-141126',
      name: 'Đà Lạt',
      start: '2026-11-12',
      end: '2026-11-14',
      stoppedAt: null,
      countsFrom: '2026-11-05',
      groupIds: [],
      budgetId: null,
      createdAt: '2026-11-05T00:00:00.000Z',
    };

    stubApis({ events: [fixedEndEvent] });
    renderVi('/events/ev-rep');

    const link = await screen.findByTestId('event-view-report');
    expect(link).toHaveTextContent('Xem báo cáo');
    expect(link).toHaveAttribute(
      'href',
      '/reports?mode=custom&from=2026-11-05&to=2026-11-13&tagId=tag-rep',
    );
    expect(screen.getByTestId('event-day-line')).toHaveTextContent('ngày 2/3');
  });

  it('null tag hides the report link and shows 0', async () => {
    const nullTagEvent: EventView = {
      id: 'ev-null',
      tagId: null,
      tagName: null,
      name: 'Sự kiện cũ',
      start: '2026-11-12',
      end: '2026-11-14',
      stoppedAt: null,
      countsFrom: '2026-11-12',
      groupIds: [],
      budgetId: null,
      createdAt: '2026-11-12T00:00:00.000Z',
    };

    stubApis({ events: [nullTagEvent] });
    renderVi('/events/ev-null');

    const card = await screen.findByTestId('event-summary-card');
    expect(card).toHaveTextContent('0₫');
    expect(screen.queryByTestId('event-view-report')).not.toBeInTheDocument();
    expect(screen.queryByTestId('event-tag-name')).not.toBeInTheDocument();
  });

  it('editing a stopped event saves without sending end', async () => {
    const user = userEvent.setup();
    const stoppedEvent: EventView = {
      id: 'ev-stop',
      tagId: 'tag-stop',
      tagName: 'dalat-101126-111126',
      name: 'Đà Lạt',
      start: '2026-11-10',
      end: '2026-11-11',
      stoppedAt: '2026-11-11T12:00:00.000Z',
      countsFrom: '2026-11-10',
      groupIds: [],
      budgetId: null,
      createdAt: '2026-11-10T00:00:00.000Z',
    };

    const api = stubApis({
      events: [stoppedEvent],
      extraRoutes: {
        'PATCH /api/me/personal/events/ev-stop': () =>
          Response.json({
            event: { ...stoppedEvent, name: 'Đà Lạt 2' },
            existing: { own: { count: 0, totals: [] }, shares: { count: 0, total: 0 } },
          }),
      },
    });

    const onSaved = vi.fn();
    renderAt(<EventForm open onClose={vi.fn()} event={stoppedEvent} onSaved={onSaved} />, {
      route: '/events/ev-stop',
      path: '*',
    });
    act(() => {
      setLang('vi', false);
    });

    const endInput = await screen.findByTestId('event-form-end');
    expect(endInput).toBeDisabled();
    expect(endInput).toHaveValue('2026-11-11');

    const nameInput = screen.getByTestId('event-form-name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Đà Lạt 2');
    await user.click(screen.getByTestId('event-form-submit'));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    const patchCall = api.calls.find(
      (c) => c.method === 'PATCH' && c.path === '/api/me/personal/events/ev-stop',
    );
    expect(patchCall).toBeDefined();
    expect(patchCall?.body).not.toHaveProperty('end');
    expect(patchCall?.body).toMatchObject({ name: 'Đà Lạt 2' });
  });
});
