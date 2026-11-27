import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CategoryView,
  TagView,
  TravelSavedResponse,
  TravelView,
  TripListItem,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { App } from '../../App';
import { TravelExistingSheet } from '../../components/travels/TravelExistingSheet';
import { TravelForm } from '../../components/travels/TravelForm';

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
  travels?: TravelView[];
  groups?: TripListItem[];
  extraRoutes?: Record<string, unknown>;
} = {}) {
  const { travels = [], groups = myGroups, extraRoutes = {} } = opts;
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/personal/travels': { travels },
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

function renderVi(route = '/travels') {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('TravelForm', () => {
  it('form requires name and dates', async () => {
    const user = userEvent.setup();
    stubApis();
    renderVi('/travels');

    await user.click(await screen.findByTestId('travels-empty-add'));
    const form = await screen.findByTestId('travel-form');
    expect(form).toHaveClass('fsl-travel-form');

    const submit = screen.getByTestId('travel-form-submit');
    expect(submit).toBeDisabled();

    // Fill name only -> still disabled
    const nameInput = screen.getByTestId('travel-form-name');
    expect(nameInput).toHaveClass('text-base');
    await user.type(nameInput, 'Đà Lạt');
    expect(submit).toBeDisabled();

    // Fill start only -> still disabled
    const startInput = screen.getByTestId('travel-form-start');
    const endInput = screen.getByTestId('travel-form-end');
    expect(startInput).toHaveClass('text-base');
    expect(endInput).toHaveClass('text-base');
    fireEvent.change(startInput, { target: { value: '2026-11-12' } });
    expect(submit).toBeDisabled();

    // End before start -> still disabled
    fireEvent.change(endInput, { target: { value: '2026-11-10' } });
    expect(submit).toBeDisabled();

    // Valid end -> enabled
    fireEvent.change(endInput, { target: { value: '2026-11-14' } });
    expect(submit).not.toBeDisabled();
  });

  it('overlap error shows under the dates and keeps the sheet open', async () => {
    const user = userEvent.setup();
    stubApis({
      extraRoutes: {
        'POST /api/me/personal/travels': () =>
          Response.json(
            {
              error: {
                code: 'TRAVEL_OVERLAP',
                message: 'Trip dates overlap another trip',
                details: {
                  travelId: 'tr-hue',
                  name: 'Huế',
                  start: '2026-12-20',
                  end: '2026-12-23',
                },
              },
            },
            { status: 409 },
          ),
      },
    });

    renderVi('/travels');
    await user.click(await screen.findByTestId('travels-empty-add'));
    await screen.findByTestId('travel-form');

    await user.type(screen.getByTestId('travel-form-name'), 'Đà Lạt');
    fireEvent.change(screen.getByTestId('travel-form-start'), { target: { value: '2026-12-21' } });
    fireEvent.change(screen.getByTestId('travel-form-end'), { target: { value: '2026-12-25' } });
    await user.click(screen.getByTestId('travel-form-submit'));

    const overlap = await screen.findByTestId('travel-form-overlap');
    expect(overlap).toHaveTextContent(/Huế/);
    expect(overlap).toHaveTextContent(/20–23\/12/);
    // Sheet stays open
    expect(screen.getByTestId('travel-form')).toBeInTheDocument();

    // Changing start or end clears the overlap error
    fireEvent.change(screen.getByTestId('travel-form-start'), { target: { value: '2026-12-26' } });
    fireEvent.change(screen.getByTestId('travel-form-end'), { target: { value: '2026-12-28' } });
    expect(screen.queryByTestId('travel-form-overlap')).not.toBeInTheDocument();
  });

  it('existing sheet appears only when there is something to tag and sends tag:true / tag:false', async () => {
    const user = userEvent.setup();
    const savedNoExisting: TravelSavedResponse = {
      travel: {
        id: 'tr-new-1',
        tagId: 'tag-dl',
        name: 'Đà Lạt',
        start: '2026-11-12',
        end: '2026-11-14',
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
        'POST /api/me/personal/travels': () => Response.json(savedNoExisting, { status: 201 }),
      },
    });

    const first = renderVi('/travels');
    await user.click(await screen.findByTestId('travels-empty-add'));
    await screen.findByTestId('travel-form');

    await user.type(screen.getByTestId('travel-form-name'), 'Đà Lạt');
    fireEvent.change(screen.getByTestId('travel-form-start'), { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByTestId('travel-form-end'), { target: { value: '2026-11-14' } });
    await user.click(screen.getByTestId('travel-form-submit'));

    // No existing items -> navigates straight to /travels/tr-new-1 without showing existing sheet
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/travels/tr-new-1');
    });
    expect(screen.queryByTestId('travel-existing-sheet')).not.toBeInTheDocument();
    expect(api1.calls.filter((c) => c.path.includes('/existing'))).toHaveLength(0);
    first.unmount();

    // Case 2: existing items > 0 -> shows sheet and sends tag: true
    const savedWithExisting: TravelSavedResponse = {
      travel: { ...savedNoExisting.travel, id: 'tr-new-2' },
      existing: {
        own: { count: 8, totals: [{ currency: 'VND', amount: 1_920_000 }] },
        shares: { count: 4, total: 1_180_000 },
      },
    };

    const api2 = stubApis({
      extraRoutes: {
        'POST /api/me/personal/travels': () => Response.json(savedWithExisting, { status: 201 }),
        'POST /api/me/personal/travels/tr-new-2/existing': () => Response.json({ tagged: 12 }),
      },
    });

    const second = renderVi('/travels');
    await user.click(await screen.findByTestId('travels-empty-add'));
    await screen.findByTestId('travel-form');
    await user.type(screen.getByTestId('travel-form-name'), 'Đà Lạt');
    fireEvent.change(screen.getByTestId('travel-form-start'), { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByTestId('travel-form-end'), { target: { value: '2026-11-14' } });
    await user.click(screen.getByTestId('travel-form-submit'));

    const existingSheet = await screen.findByTestId('travel-existing-sheet');
    expect(within(existingSheet).getByText(/8 khoản bạn tự chi/)).toBeInTheDocument();
    expect(within(existingSheet).getByText(/4 phần trong nhóm/)).toBeInTheDocument();
    expect(within(existingSheet).getByTestId('travel-existing-yes')).toHaveTextContent('Gắn tag cho cả 12 khoản');

    await user.click(within(existingSheet).getByTestId('travel-existing-yes'));

    await waitFor(() => {
      const existingCall = api2.calls.find((c) => c.path === '/api/me/personal/travels/tr-new-2/existing');
      expect(existingCall?.body).toEqual({ tag: true });
    });
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/travels/tr-new-2');
    });
    second.unmount();

    // Case 3: choosing "Chỉ từ giờ trở đi" sends tag: false
    const savedWithExisting3: TravelSavedResponse = {
      travel: { ...savedNoExisting.travel, id: 'tr-new-3' },
      existing: {
        own: { count: 2, totals: [{ currency: 'VND', amount: 300_000 }] },
        shares: { count: 0, total: 0 },
      },
    };

    const api3 = stubApis({
      extraRoutes: {
        'POST /api/me/personal/travels': () => Response.json(savedWithExisting3, { status: 201 }),
        'POST /api/me/personal/travels/tr-new-3/existing': () => Response.json({ tagged: 0 }),
      },
    });

    renderVi('/travels');
    await user.click(await screen.findByTestId('travels-empty-add'));
    await screen.findByTestId('travel-form');
    await user.type(screen.getByTestId('travel-form-name'), 'Đà Lạt');
    fireEvent.change(screen.getByTestId('travel-form-start'), { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByTestId('travel-form-end'), { target: { value: '2026-11-14' } });
    await user.click(screen.getByTestId('travel-form-submit'));

    const existingSheet3 = await screen.findByTestId('travel-existing-sheet');
    await user.click(within(existingSheet3).getByTestId('travel-existing-no'));

    await waitFor(() => {
      const existingCall = api3.calls.find((c) => c.path === '/api/me/personal/travels/tr-new-3/existing');
      expect(existingCall?.body).toEqual({ tag: false });
    });
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/travels/tr-new-3');
    });
  });

  it('group picker lists groups but not the direct group', async () => {
    const user = userEvent.setup();
    stubApis();
    renderVi('/travels');

    await user.click(await screen.findByTestId('travels-empty-add'));
    await screen.findByTestId('travel-form');

    await user.click(screen.getByTestId('travel-form-pick-groups'));
    const picker = await screen.findByTestId('travel-group-picker');

    expect(within(picker).getByText('Đà Lạt gang')).toBeInTheDocument();
    expect(within(picker).getByText('Cầu lông T5')).toBeInTheDocument();
    expect(within(picker).queryByText('Khoản chi nhanh')).not.toBeInTheDocument();

    // Select a group and close picker -> shows as Pill chip in the form
    await user.click(within(picker).getByTestId('travel-group-check-g-dl'));
    await user.click(within(picker).getByTestId('travel-group-picker-done'));

    const form = screen.getByTestId('travel-form');
    const chip = within(form).getByTestId('travel-form-group-chip-g-dl');
    expect(chip).toHaveTextContent('Đà Lạt gang');
    const removeBtn = within(chip).getByRole('button', { name: 'Bỏ Đà Lạt gang' });
    expect(removeBtn).toHaveClass('min-h-11', 'min-w-11');
  });

  it('edit mode shows end-early only while on and confirms delete via Modal', async () => {
    const user = userEvent.setup();
    const onTrip: TravelView = {
      id: 'tr-on',
      tagId: 'tag-dl',
      name: 'Đà Lạt',
      start: '2026-11-04',
      end: '2026-11-08',
      countsFrom: '2026-11-01',
      groupIds: [],
      budgetId: null,
      createdAt: '2026-11-01T00:00:00.000Z',
    };
    const upcomingTrip: TravelView = {
      ...onTrip,
      id: 'tr-up',
      start: '2026-11-12',
      end: '2026-11-14',
    };

    const api = stubApis({
      travels: [onTrip, upcomingTrip],
      extraRoutes: {
        'PATCH /api/me/personal/travels/tr-on': () =>
          Response.json({
            travel: { ...onTrip, end: '2026-11-05' },
            existing: { own: { count: 0, totals: [] }, shares: { count: 0, total: 0 } },
          }),
        'DELETE /api/me/personal/travels/tr-up': () => new Response(null, { status: 204 }),
      },
    });

    const onSaved = vi.fn();
    const onClose = vi.fn();

    const first = renderAt(
      <TravelForm open onClose={onClose} travel={onTrip} onSaved={onSaved} />,
      { route: '/travels/tr-on', path: '*' },
    );
    act(() => {
      setLang('vi', false);
    });

    // Ongoing trip has both "Kết thúc sớm" and "Xóa chuyến đi"
    const endEarlyBtn = await screen.findByTestId('travel-form-end-early');
    await user.click(endEarlyBtn);
    await user.click(await screen.findByTestId('travel-form-end-early-confirm'));

    await waitFor(() => {
      const patchCall = api.calls.find(
        (c) => c.method === 'PATCH' && c.path === '/api/me/personal/travels/tr-on',
      );
      expect(patchCall?.body).toEqual({ endNow: true, today: '2026-11-05' });
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    first.unmount();

    // Upcoming trip has no "Kết thúc sớm", only "Xóa chuyến đi"
    renderAt(
      <TravelForm open onClose={onClose} travel={upcomingTrip} onSaved={onSaved} />,
      { route: '/travels/tr-up', path: '*' },
    );
    act(() => {
      setLang('vi', false);
    });

    await screen.findByTestId('travel-form');
    expect(screen.queryByTestId('travel-form-end-early')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('travel-form-delete'));
    await user.click(await screen.findByTestId('travel-form-delete-confirm'));

    await waitFor(() => {
      expect(
        api.calls.some((c) => c.method === 'DELETE' && c.path === '/api/me/personal/travels/tr-up'),
      ).toBe(true);
    });
  });

  it('save an edit before budgets load omits limit from the request body', async () => {
    const user = userEvent.setup();
    const tripWithBudget: TravelView = {
      id: 'tr-b',
      tagId: 'tag-dl',
      name: 'Đà Lạt',
      start: '2026-11-12',
      end: '2026-11-14',
      countsFrom: '2026-11-05',
      groupIds: [],
      budgetId: 'b-dl',
      createdAt: '2026-11-05T00:00:00.000Z',
    };

    const api = stubApis({
      travels: [tripWithBudget],
      extraRoutes: {
        // Never resolves so budgets stay in loading state
        'GET /api/me/personal/budgets': () => new Promise<Response>(() => {}),
        'PATCH /api/me/personal/travels/tr-b': () =>
          Response.json({
            travel: { ...tripWithBudget, name: 'Đà Lạt 2' },
            existing: { own: { count: 0, totals: [] }, shares: { count: 0, total: 0 } },
          }),
      },
    });

    const onSaved = vi.fn();
    renderAt(
      <TravelForm open onClose={vi.fn()} travel={tripWithBudget} onSaved={onSaved} />,
      { route: '/travels/tr-b', path: '*' },
    );
    act(() => {
      setLang('vi', false);
    });

    const nameInput = await screen.findByTestId('travel-form-name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Đà Lạt 2');

    const submit = screen.getByTestId('travel-form-submit');
    expect(submit).not.toBeDisabled();
    await user.click(submit);

    await waitFor(() => {
      expect(
        api.calls.some((c) => c.method === 'PATCH' && c.path === '/api/me/personal/travels/tr-b'),
      ).toBe(true);
    });

    const patchBody = api.calls.find(
      (c) => c.method === 'PATCH' && c.path === '/api/me/personal/travels/tr-b',
    )?.body as Record<string, unknown>;
    expect('limit' in patchBody).toBe(false);
    expect(patchBody.name).toBe('Đà Lạt 2');
  });

  it('untouched countsFrom follows defaultCountsFrom(start, today) and moving start earlier clamps touched countsFrom', async () => {
    const user = userEvent.setup();
    stubApis();
    renderVi('/travels');

    await user.click(await screen.findByTestId('travels-empty-add'));
    await screen.findByTestId('travel-form');

    await user.type(screen.getByTestId('travel-form-name'), 'Đà Lạt');

    // Today is 2026-11-05. Future start (2026-11-12) -> defaultCountsFrom = 2026-11-05 (5/11)
    fireEvent.change(screen.getByTestId('travel-form-start'), { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByTestId('travel-form-end'), { target: { value: '2026-11-14' } });
    expect(screen.getByTestId('travel-form-counts-from-toggle')).toHaveTextContent('5/11');

    // Earlier start (2026-11-02 < today) -> untouched default follows start (2/11)
    fireEvent.change(screen.getByTestId('travel-form-start'), { target: { value: '2026-11-02' } });
    expect(screen.getByTestId('travel-form-counts-from-toggle')).toHaveTextContent('2/11');

    // Move start back to 2026-11-12, open countsFrom picker, and pick 2026-11-10
    fireEvent.change(screen.getByTestId('travel-form-start'), { target: { value: '2026-11-12' } });
    await user.click(screen.getByTestId('travel-form-counts-from-toggle'));
    fireEvent.change(screen.getByTestId('travel-form-counts-from'), {
      target: { value: '2026-11-10' },
    });
    expect(screen.getByTestId('travel-form-counts-from')).toHaveValue('2026-11-10');

    // Now move start earlier than countsFrom (2026-11-08) -> countsFrom clamps to 2026-11-08 and Save stays enabled
    fireEvent.change(screen.getByTestId('travel-form-start'), { target: { value: '2026-11-08' } });
    expect(screen.getByTestId('travel-form-counts-from')).toHaveValue('2026-11-08');
    expect(screen.getByTestId('travel-form-submit')).not.toBeDisabled();
  });

  it('closing the existing-items sheet (dismiss) sends tag:false exactly once', async () => {
    const user = userEvent.setup();
    const api = stubApis({
      extraRoutes: {
        'POST /api/me/personal/travels/tr-dismiss/existing': () => Response.json({ tagged: 0 }),
      },
    });
    const onDone = vi.fn();

    renderAt(
      <TravelExistingSheet
        travelId="tr-dismiss"
        existing={{
          own: { count: 3, totals: [{ currency: 'VND', amount: 500_000 }] },
          shares: { count: 0, total: 0 },
        }}
        onDone={onDone}
      />,
      { route: '/travels', path: '*' },
    );
    act(() => {
      setLang('vi', false);
    });

    await screen.findByTestId('travel-existing-sheet');
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1);
    });
    const calls = api.calls.filter(
      (c) => c.path === '/api/me/personal/travels/tr-dismiss/existing',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual({ tag: false });
  });
});
