import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CategoryView,
  TagView,
  EventSavedResponse,
  EventView,
  TripListItem,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { App } from '../../App';
import { EventExistingSheet } from '../../components/events/EventExistingSheet';
import { EventForm } from '../../components/events/EventForm';

vi.mock('@cc/web-util/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-util/localDate')>();
  return {
    ...actual,
    todayLocal: () => '2026-11-05',
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
  { id: 'tag-dl', name: 'Đà Lạt', useCount: 3 },
  { id: 'tag-hue', name: 'Huế', useCount: 1 },
];

const myGroups: TripListItem[] = [
  { id: 'g-dl', name: 'Đà Lạt gang', archived: false, myBalance: 0, preset: 'trip' },
  { id: 'g-badminton', name: 'Cầu lông T5', archived: false, myBalance: 0, preset: 'sport' },
  { id: 'g-direct', name: 'Khoản chi nhanh', archived: false, myBalance: 0, preset: 'direct' },
];

function stubApis(opts: {
  events?: EventView[];
  groups?: TripListItem[];
  extraRoutes?: Record<string, unknown>;
} = {}) {
  const { events = [], groups = myGroups, extraRoutes = {} } = opts;
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/events': { events },
    'GET /api/me/personal/budgets': { budgets: [] },
    'GET /api/me/personal/budgets/progress': { today: '2026-11-05', rows: [] },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/ledger': ledger,
    'GET /api/me/people': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips': groups,
    ...extraRoutes,
  });
}

function renderVi(route = '/events') {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('EventForm', () => {
  it('form requires name, allows optional dates, and rejects end before start', async () => {
    const user = userEvent.setup();
    stubApis();
    renderVi('/events');

    await user.click(await screen.findByTestId('events-empty-add'));
    const form = await screen.findByTestId('event-form');
    expect(form).toHaveClass('fsl-event-form');

    const submit = screen.getByTestId('event-form-submit');
    expect(submit).toBeDisabled();
    // No tag suggestions picker
    expect(screen.queryByTestId('event-form-tag-suggestions')).not.toBeInTheDocument();
    // Counts-from line hidden until start date is picked
    expect(screen.queryByTestId('event-form-counts-from-toggle')).not.toBeInTheDocument();

    // Fill name only -> enabled (start defaults to today, end is optional)
    const nameInput = screen.getByTestId('event-form-name');
    expect(nameInput).toHaveClass('text-base');
    await user.type(nameInput, 'Đà Lạt');
    expect(submit).not.toBeDisabled();

    // Fill start -> counts-from line appears
    const startInput = screen.getByTestId('event-form-start');
    const endInput = screen.getByTestId('event-form-end');
    expect(startInput).toHaveClass('text-base');
    expect(endInput).toHaveClass('text-base');
    fireEvent.change(startInput, { target: { value: '2026-11-12' } });
    expect(screen.getByTestId('event-form-counts-from-toggle')).toBeInTheDocument();
    expect(submit).not.toBeDisabled();

    // End before start -> disabled and shows range error
    fireEvent.change(endInput, { target: { value: '2026-11-10' } });
    expect(submit).toBeDisabled();
    expect(screen.getByTestId('event-form-range-error')).toBeInTheDocument();

    // Valid end -> enabled
    fireEvent.change(endInput, { target: { value: '2026-11-14' } });
    expect(submit).not.toBeDisabled();
  });

  it('existing sheet appears only when there is something to tag and sends tag:true / tag:false', async () => {
    const user = userEvent.setup();
    const savedNoExisting: EventSavedResponse = {
      event: {
        id: 'tr-new-1',
        tagId: 'tag-dl',
        tagName: 'dalat-121126-141126',
        name: 'Đà Lạt',
        start: '2026-11-12',
        end: '2026-11-14',
        stoppedAt: null,
        countsFrom: '2026-11-05',
        groupIds: [],
        budgetId: null,
        createdAt: '2026-11-05T00:00:00.000Z',
      },
      existing: {
        own: { count: 0, totals: [] },
        shares: { count: 0, total: 0 },
      },
    };

    const api1 = stubApis({
      extraRoutes: {
        'POST /api/me/personal/events': () => Response.json(savedNoExisting, { status: 201 }),
      },
    });

    const first = renderVi('/events');
    await user.click(await screen.findByTestId('events-empty-add'));
    await screen.findByTestId('event-form');

    await user.type(screen.getByTestId('event-form-name'), 'Đà Lạt');
    fireEvent.change(screen.getByTestId('event-form-start'), { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByTestId('event-form-end'), { target: { value: '2026-11-14' } });
    await user.click(screen.getByTestId('event-form-submit'));

    // No existing items -> navigates straight to /events/tr-new-1 without showing existing sheet
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/events/tr-new-1');
    });
    expect(screen.queryByTestId('event-existing-sheet')).not.toBeInTheDocument();
    expect(api1.calls.filter((c) => c.path.includes('/existing'))).toHaveLength(0);
    first.unmount();

    // Case 2: existing items > 0 -> shows sheet and sends tag: true
    const savedWithExisting: EventSavedResponse = {
      event: { ...savedNoExisting.event, id: 'tr-new-2' },
      existing: {
        own: { count: 8, totals: [{ currency: 'VND', amount: 1_920_000 }] },
        shares: { count: 4, total: 1_180_000 },
      },
    };

    const api2 = stubApis({
      extraRoutes: {
        'POST /api/me/personal/events': () => Response.json(savedWithExisting, { status: 201 }),
        'POST /api/me/personal/events/tr-new-2/existing': () => Response.json({ tagged: 12 }),
      },
    });

    const second = renderVi('/events');
    await user.click(await screen.findByTestId('events-empty-add'));
    await screen.findByTestId('event-form');
    await user.type(screen.getByTestId('event-form-name'), 'Đà Lạt');
    fireEvent.change(screen.getByTestId('event-form-start'), { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByTestId('event-form-end'), { target: { value: '2026-11-14' } });
    await user.click(screen.getByTestId('event-form-submit'));

    const existingSheet = await screen.findByTestId('event-existing-sheet');
    expect(within(existingSheet).getByText(/8 khoản bạn tự chi/)).toBeInTheDocument();
    expect(within(existingSheet).getByText(/4 phần trong nhóm/)).toBeInTheDocument();
    expect(within(existingSheet).getByTestId('event-existing-yes')).toHaveTextContent('Gắn thẻ cho cả 12 khoản');

    await user.click(within(existingSheet).getByTestId('event-existing-yes'));

    await waitFor(() => {
      const existingCall = api2.calls.find((c) => c.path === '/api/me/personal/events/tr-new-2/existing');
      expect(existingCall?.body).toEqual({ tag: true });
    });
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/events/tr-new-2');
    });
    second.unmount();

    // Case 3: choosing "Chỉ từ giờ trở đi" sends tag: false
    const savedWithExisting3: EventSavedResponse = {
      event: { ...savedNoExisting.event, id: 'tr-new-3' },
      existing: {
        own: { count: 2, totals: [{ currency: 'VND', amount: 300_000 }] },
        shares: { count: 0, total: 0 },
      },
    };

    const api3 = stubApis({
      extraRoutes: {
        'POST /api/me/personal/events': () => Response.json(savedWithExisting3, { status: 201 }),
        'POST /api/me/personal/events/tr-new-3/existing': () => Response.json({ tagged: 0 }),
      },
    });

    renderVi('/events');
    await user.click(await screen.findByTestId('events-empty-add'));
    await screen.findByTestId('event-form');
    await user.type(screen.getByTestId('event-form-name'), 'Đà Lạt');
    fireEvent.change(screen.getByTestId('event-form-start'), { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByTestId('event-form-end'), { target: { value: '2026-11-14' } });
    await user.click(screen.getByTestId('event-form-submit'));

    const existingSheet3 = await screen.findByTestId('event-existing-sheet');
    await user.click(within(existingSheet3).getByTestId('event-existing-no'));

    await waitFor(() => {
      const existingCall = api3.calls.find((c) => c.path === '/api/me/personal/events/tr-new-3/existing');
      expect(existingCall?.body).toEqual({ tag: false });
    });
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/events/tr-new-3');
    });
  });

  it('group picker lists groups but not the direct group', async () => {
    const user = userEvent.setup();
    stubApis();
    renderVi('/events');

    await user.click(await screen.findByTestId('events-empty-add'));
    await screen.findByTestId('event-form');

    await user.click(screen.getByTestId('event-form-pick-groups'));
    const picker = await screen.findByTestId('event-group-picker');

    expect(within(picker).getByText('Đà Lạt gang')).toBeInTheDocument();
    expect(within(picker).getByText('Cầu lông T5')).toBeInTheDocument();
    expect(within(picker).queryByText('Khoản chi nhanh')).not.toBeInTheDocument();

    // Select a group and close picker -> shows as Pill chip in the form
    await user.click(within(picker).getByTestId('event-group-check-g-dl'));
    await user.click(within(picker).getByTestId('event-group-picker-done'));

    const form = screen.getByTestId('event-form');
    const chip = within(form).getByTestId('event-form-group-chip-g-dl');
    expect(chip).toHaveTextContent('Đà Lạt gang');
    const removeBtn = within(chip).getByRole('button', { name: 'Bỏ Đà Lạt gang' });
    expect(removeBtn).toHaveClass('min-h-11', 'min-w-11');
  });

  it('edit mode confirms delete via Modal', async () => {
    const user = userEvent.setup();
    const upcomingEvent: EventView = {
      id: 'tr-up',
      tagId: 'tag-dl',
      tagName: 'dalat-121126-141126',
      name: 'Đà Lạt',
      start: '2026-11-12',
      end: '2026-11-14',
      stoppedAt: null,
      countsFrom: '2026-11-01',
      groupIds: [],
      budgetId: null,
      createdAt: '2026-11-01T00:00:00.000Z',
    };

    const api = stubApis({
      events: [upcomingEvent],
      extraRoutes: {
        'DELETE /api/me/personal/events/tr-up': () => new Response(null, { status: 204 }),
      },
    });

    const onSaved = vi.fn();
    const onClose = vi.fn();

    renderAt(
      <EventForm open onClose={onClose} event={upcomingEvent} onSaved={onSaved} />,
      { route: '/events/tr-up', path: '*' },
    );
    act(() => {
      setLang('vi', false);
    });

    await screen.findByTestId('event-form');
    await user.click(screen.getByTestId('event-form-delete'));
    await user.click(await screen.findByTestId('event-form-delete-confirm'));

    await waitFor(() => {
      expect(
        api.calls.some((c) => c.method === 'DELETE' && c.path === '/api/me/personal/events/tr-up'),
      ).toBe(true);
    });
  });

  it('save an edit before budgets load omits limit from the request body', async () => {
    const user = userEvent.setup();
    const tripWithBudget: EventView = {
      id: 'tr-b',
      tagId: 'tag-dl',
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

    const api = stubApis({
      events: [tripWithBudget],
      extraRoutes: {
        // Never resolves so budgets stay in loading state
        'GET /api/me/personal/budgets': () => new Promise<Response>(() => {}),
        'PATCH /api/me/personal/events/tr-b': () =>
          Response.json({
            event: { ...tripWithBudget, name: 'Đà Lạt 2' },
            existing: { own: { count: 0, totals: [] }, shares: { count: 0, total: 0 } },
          }),
      },
    });

    const onSaved = vi.fn();
    renderAt(
      <EventForm open onClose={vi.fn()} event={tripWithBudget} onSaved={onSaved} />,
      { route: '/events/tr-b', path: '*' },
    );
    act(() => {
      setLang('vi', false);
    });

    const nameInput = await screen.findByTestId('event-form-name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Đà Lạt 2');

    const submit = screen.getByTestId('event-form-submit');
    expect(submit).not.toBeDisabled();
    await user.click(submit);

    await waitFor(() => {
      expect(
        api.calls.some((c) => c.method === 'PATCH' && c.path === '/api/me/personal/events/tr-b'),
      ).toBe(true);
    });

    const patchBody = api.calls.find(
      (c) => c.method === 'PATCH' && c.path === '/api/me/personal/events/tr-b',
    )?.body as Record<string, unknown>;
    expect('limit' in patchBody).toBe(false);
    expect(patchBody.name).toBe('Đà Lạt 2');
  });

  it('untouched countsFrom follows defaultCountsFrom(start, today) and moving start earlier clamps touched countsFrom', async () => {
    const user = userEvent.setup();
    stubApis();
    renderVi('/events');

    await user.click(await screen.findByTestId('events-empty-add'));
    await screen.findByTestId('event-form');

    await user.type(screen.getByTestId('event-form-name'), 'Đà Lạt');

    // Today is 2026-11-05. Future start (2026-11-12) -> defaultCountsFrom = 2026-11-05 (5/11)
    fireEvent.change(screen.getByTestId('event-form-start'), { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByTestId('event-form-end'), { target: { value: '2026-11-14' } });
    expect(screen.getByTestId('event-form-counts-from-toggle')).toHaveTextContent('5/11');

    // Earlier start (2026-11-02 < today) -> untouched default follows start (2/11)
    fireEvent.change(screen.getByTestId('event-form-start'), { target: { value: '2026-11-02' } });
    expect(screen.getByTestId('event-form-counts-from-toggle')).toHaveTextContent('2/11');

    // Move start back to 2026-11-12, open countsFrom picker, and pick 2026-11-10
    fireEvent.change(screen.getByTestId('event-form-start'), { target: { value: '2026-11-12' } });
    await user.click(screen.getByTestId('event-form-counts-from-toggle'));
    fireEvent.change(screen.getByTestId('event-form-counts-from'), {
      target: { value: '2026-11-10' },
    });
    expect(screen.getByTestId('event-form-counts-from')).toHaveValue('2026-11-10');

    // Now move start earlier than countsFrom (2026-11-08) -> countsFrom clamps to 2026-11-08 and Save stays enabled
    fireEvent.change(screen.getByTestId('event-form-start'), { target: { value: '2026-11-08' } });
    expect(screen.getByTestId('event-form-counts-from')).toHaveValue('2026-11-08');
    expect(screen.getByTestId('event-form-submit')).not.toBeDisabled();
  });

  it('closing the existing-items sheet (dismiss) sends tag:false exactly once', async () => {
    const user = userEvent.setup();
    const api = stubApis({
      extraRoutes: {
        'POST /api/me/personal/events/tr-dismiss/existing': () => Response.json({ tagged: 0 }),
      },
    });
    const onDone = vi.fn();

    renderAt(
      <EventExistingSheet
        eventId="tr-dismiss"
        existing={{
          own: { count: 3, totals: [{ currency: 'VND', amount: 500_000 }] },
          shares: { count: 0, total: 0 },
        }}
        onDone={onDone}
      />,
      { route: '/events', path: '*' },
    );
    act(() => {
      setLang('vi', false);
    });

    await screen.findByTestId('event-existing-sheet');
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
    const calls = api.calls.filter(
      (c) => c.path === '/api/me/personal/events/tr-dismiss/existing',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual({ tag: false });
  });
});
