import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CategoryView,
  CountedSpendRow,
  EventView,
  TagView,
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
    todayLocal: () => '2026-11-28',
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
  { id: 'cat-stay', parentId: null, type: 'expense', name: 'Lưu trú', icon: 'hotel', hidden: false, sortOrder: 1 },
];

const tags: TagView[] = [
  { id: 'tag-open', name: 'dalat-281126', useCount: 1 },
  { id: 'tag-same', name: 'sinhnhat-281126-281126', useCount: 1 },
  { id: 'tag-done', name: 'hanoi-010326-030326', useCount: 1 },
];

const openEvent: EventView = {
  id: 'ev-open',
  tagId: 'tag-open',
  tagName: 'dalat-281126',
  name: 'Đà Lạt',
  start: '2026-11-28',
  end: null,
  stoppedAt: null,
  countsFrom: '2026-11-28',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-28T00:00:00.000Z',
};

const sameDayEvent: EventView = {
  id: 'ev-same',
  tagId: 'tag-same',
  tagName: 'sinhnhat-281126-281126',
  name: 'Sinh nhật',
  start: '2026-11-28',
  end: '2026-11-28',
  stoppedAt: null,
  countsFrom: '2026-11-28',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-28T00:00:00.000Z',
};

const crossYearEvent: EventView = {
  id: 'ev-cross',
  tagId: 'tag-open',
  tagName: 'tet-281126-100227',
  name: 'Mua sắm Tết',
  start: '2026-11-28',
  end: '2027-02-10',
  stoppedAt: null,
  countsFrom: '2026-11-28',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-11-28T00:00:00.000Z',
};

const doneNoLimitEvent: EventView = {
  id: 'ev-done',
  tagId: 'tag-done',
  tagName: 'hanoi-010326-030326',
  name: 'Hà Nội',
  start: '2026-03-01',
  end: '2026-03-03',
  stoppedAt: '2026-03-03T12:00:00.000Z',
  countsFrom: '2026-03-01',
  groupIds: [],
  budgetId: null,
  createdAt: '2026-03-01T00:00:00.000Z',
};

function stubApis(opts: { events?: EventView[]; rows?: CountedSpendRow[] } = {}) {
  const { events = [], rows = [] } = opts;
  return mockApi({
    'GET /api/me': meOn,
    'GET /api/me/ledger': ledger,
    'GET /api/me/people': peopleSummary,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips/t-led/version': { version: 1 },
    'GET /api/trips': [],
    'GET /api/me/groups': { items: [] },
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags },
    'GET /api/me/personal/group-settings': {
      settings: { defaultGroupCategoryId: null, countLoans: false },
    },
    'GET /api/me/personal/transactions': { rows: [], totals: [] },
    'GET /api/me/personal/budgets': { budgets: [] },
    'GET /api/me/personal/budgets/progress': { today: '2026-11-28', rows },
    'GET /api/me/personal/events': { events },
    'GET /api/me/personal/events/ev-open/rows': { rows },
    'POST /api/me/personal/events/tag-shares': { tagged: 0 },
  });
}

function renderVi(route: string) {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('Event design round (D1, D3–D9)', () => {
  it('open-range line shows "Từ 28/11 · chưa có ngày kết thúc", cross-year shows "28/11 – 10/2/2027", and tag line sits below meta', async () => {
    stubApis({ events: [openEvent, crossYearEvent] });
    const first = renderVi('/events/ev-open');

    const meta = await screen.findByTestId('event-meta-line');
    expect(meta).toHaveTextContent('Từ 28/11 · chưa có ngày kết thúc');
    expect(meta).not.toHaveTextContent('#dalat-281126');

    const tagLine = screen.getByTestId('event-tag-name');
    expect(tagLine).toHaveTextContent('Thẻ: #dalat-281126');
    expect(screen.queryByTestId('event-view-report')).not.toBeInTheDocument();
    first.unmount();

    stubApis({ events: [crossYearEvent] });
    renderVi('/events/ev-cross');
    expect(await screen.findByTestId('event-meta-line')).toHaveTextContent('28/11 – 10/2/2027');
  });

  it('same-day event displays the date once', async () => {
    stubApis({ events: [sameDayEvent] });
    renderVi('/events/ev-same');

    const meta = await screen.findByTestId('event-meta-line');
    expect(meta).toHaveTextContent('28/11');
    expect(meta).not.toHaveTextContent('28/11 – 28/11');
  });

  it('book row status is not truncated, names are on line 2, and single-event stop is a secondary pill', async () => {
    stubApis({ events: [openEvent, crossYearEvent] });
    const first = renderVi('/trips');

    const row = await screen.findByTestId('book-event-row');
    await waitFor(() => {
      expect(within(row).getByTestId('book-event-title')).toHaveTextContent('2 sự kiện đang diễn ra');
    });
    const title = within(row).getByTestId('book-event-title');
    const subtitle = within(row).getByTestId('book-event-subtitle');
    expect(title).not.toHaveClass('truncate');
    expect(subtitle).toHaveTextContent('Đà Lạt, Mua sắm Tết');
    expect(subtitle).toHaveClass('truncate');
    first.unmount();

    // Single running event: status not truncated, stop button is secondary pill
    stubApis({ events: [openEvent] });
    renderVi('/trips');

    const stopBtn = await screen.findByTestId('book-event-stop');
    expect(stopBtn).toHaveClass('fsl-button--secondary', 'min-h-11', 'rounded-full');
    expect(screen.getByTestId('book-event-title')).not.toHaveClass('truncate');
  });

  it('stop confirm uses primary (not danger) and new copy, and Stop/Resume buttons use secondary variant', async () => {
    const user = userEvent.setup();
    stubApis({ events: [openEvent] });
    const first = renderVi('/events/ev-open');

    const stopBtn = await screen.findByTestId('event-stop-button');
    expect(stopBtn).toHaveClass('fsl-button--secondary');
    await user.click(stopBtn);

    const modal = await screen.findByTestId('event-stop-confirm-modal');
    expect(screen.getByText('Dừng Đà Lạt?')).toBeInTheDocument();
    expect(modal).toHaveTextContent(
      'Khoản chi mới sẽ không còn tự vào Đà Lạt. Bấm Tiếp tục bất cứ lúc nào.',
    );

    const confirmBtn = within(modal).getByTestId('event-stop-confirm');
    expect(confirmBtn).toHaveTextContent('Dừng sự kiện');
    expect(confirmBtn).toHaveClass('fsl-button--primary');
    expect(confirmBtn).not.toHaveClass('fsl-button--danger');
    first.unmount();

    // Resume button on a stopped event also uses secondary variant
    stubApis({ events: [doneNoLimitEvent] });
    renderVi('/events/ev-done');
    const resumeBtn = await screen.findByTestId('event-resume-button');
    expect(resumeBtn).toHaveClass('fsl-button--secondary');
  });

  it('empty events list shows listEmpty copy and back link does not point to /trips', async () => {
    stubApis({ events: [] });
    renderVi('/events');

    await screen.findByTestId('events-empty-add');
    expect(
      screen.getByText('Chưa có sự kiện nào. Tạo một sự kiện cho chuyến đi tới.'),
    ).toBeInTheDocument();

    const backLink = screen.getByRole('link', { name: 'Quay lại' });
    expect(backLink).toHaveAttribute('href', '/');
    expect(backLink.getAttribute('href')).not.toBe('/trips');
  });

  it('done event without limit shows no "Không đặt hạn mức" line', async () => {
    stubApis({ events: [doneNoLimitEvent] });
    renderVi('/events');

    const row = await screen.findByTestId('event-row-ev-done');
    expect(row).toHaveTextContent('Hà Nội');
    expect(row).not.toHaveTextContent('Không đặt hạn mức');
  });

  it('date picker displays "T2, 8/2/2027" (vi) and "Mon, 8 Feb 2027" (en) after picking', async () => {
    stubApis();
    renderAt(
      <EventForm open onClose={vi.fn()} onSaved={vi.fn()} />,
      { route: '/events', path: '*' },
    );
    act(() => {
      setLang('vi', false);
    });

    await screen.findByTestId('event-form');
    fireEvent.change(screen.getByTestId('event-form-start'), { target: { value: '2027-02-08' } });
    fireEvent.change(screen.getByTestId('event-form-end'), { target: { value: '2027-02-10' } });

    expect(screen.getByTestId('event-form-start-display')).toHaveTextContent('T2, 8/2/2027');
    expect(screen.getByTestId('event-form-end-display')).toHaveTextContent('T4, 10/2/2027');

    act(() => {
      setLang('en', false);
    });
    expect(screen.getByTestId('event-form-start-display')).toHaveTextContent('Mon, 8 Feb 2027');
    expect(screen.getByTestId('event-form-end-display')).toHaveTextContent('Wed, 10 Feb 2027');
  });

  it('single category at 100% renders without a bar on the event page', async () => {
    const singleCatRow: CountedSpendRow[] = [
      {
        id: 'r-1',
        kind: 'entry',
        date: '2026-11-28',
        amount: 450_000,
        currency: 'VND',
        walletId: 'w-cash',
        categoryId: 'cat-food',
        tagIds: ['tag-open'],
      },
    ];
    stubApis({ events: [openEvent], rows: singleCatRow });
    renderVi('/events/ev-open');

    const catRow = await screen.findByTestId('event-cat-row-cat-food');
    expect(catRow).toHaveTextContent('Ăn uống');
    expect(catRow).toHaveTextContent('450.000₫');
    expect(screen.queryByTestId('event-cat-bar-cat-food')).not.toBeInTheDocument();
  });
});
