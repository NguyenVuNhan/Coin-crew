import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  AssetView,
  CategoryView,
  PlannedItemView,
  RecurringRuleView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt, mockApi } from '../../test/render';
import { tripView } from '../../test/fixtures';
import { App } from '../../App';

vi.mock('@cc/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/core')>();
  return {
    ...actual,
    vnDate: () => '2026-11-28',
  };
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const meOff = {
  user: { id: 'u-me', email: 'me@example.com', name: 'Me', consentAt: '2026-10-12T00:00:00.000Z' },
  signIn: { zalo: true },
  mergeRequests: { incoming: [], outgoing: [] },
  personalArea: false,
};

const meOn = { ...meOff, personalArea: true };

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

const wallets: WalletDetailView[] = [
  {
    id: 'w-bank',
    name: 'Ví ngân hàng',
    currency: 'VND',
    balance: 48_250_000,
    isDefault: true,
    kind: 'everyday',
    startAmount: 48_250_000,
    startDate: '2026-01-01',
    startCostVnd: null,
    vndValue: 48_250_000,
    icon: 'bank',
    sortOrder: 0,
    archived: false,
    entryCount: 10,
    excludeFromReports: false,
  },
  {
    id: 'w-save',
    name: 'Tiết kiệm',
    currency: 'VND',
    balance: 10_000_000,
    isDefault: false,
    kind: 'everyday',
    startAmount: 10_000_000,
    startDate: '2026-01-01',
    startCostVnd: null,
    vndValue: 10_000_000,
    icon: 'piggy-bank',
    sortOrder: 1,
    archived: false,
    entryCount: 2,
    excludeFromReports: false,
  },
];

const categories: CategoryView[] = [
  { id: 'cat-rent', parentId: null, type: 'expense', name: 'Tiền nhà', icon: 'home', hidden: false, sortOrder: 0 },
  { id: 'cat-elec', parentId: null, type: 'expense', name: 'Tiền điện', icon: 'zap', hidden: false, sortOrder: 1 },
  { id: 'cat-net', parentId: null, type: 'expense', name: 'Internet', icon: 'wifi', hidden: false, sortOrder: 2 },
  { id: 'cat-gym', parentId: null, type: 'expense', name: 'Phòng gym', icon: 'dumbbell', hidden: false, sortOrder: 3 },
  { id: 'cat-salary', parentId: null, type: 'income', name: 'Lương', icon: 'briefcase', hidden: false, sortOrder: 4 },
];

const assets: AssetView[] = [
  {
    id: 'asset-etf',
    name: 'E1VFVN30',
    unit: 'CCQ',
    groupName: 'ETF',
    decimals: 2,
    hidden: false,
    sortOrder: 0,
    entryCount: 1,
  },
];

const rentRule: RecurringRuleView = {
  id: 'r-rent',
  draft: {
    type: 'expense',
    walletId: 'w-bank',
    categoryId: 'cat-rent',
    amount: 6_000_000,
    tags: [],
    note: null,
  },
  schedule: {
    unit: 'month',
    every: 1,
    monthDay: 4,
    startDate: '2026-01-04',
    end: { kind: 'never' },
  },
  askMe: false,
  status: 'active',
  pausedReason: null,
  nextDueOn: '2026-12-04',
  lastConfirmedOn: '2026-11-04',
};

const elecRule: RecurringRuleView = {
  id: 'r-elec',
  draft: {
    type: 'expense',
    walletId: 'w-bank',
    categoryId: 'cat-elec',
    amount: 850_000,
    tags: [],
    note: null,
  },
  schedule: {
    unit: 'month',
    every: 1,
    monthDay: 20,
    startDate: '2026-01-20',
    end: { kind: 'never' },
  },
  askMe: true,
  status: 'active',
  pausedReason: null,
  nextDueOn: '2026-12-20',
  lastConfirmedOn: '2026-10-20',
};

const salaryRule: RecurringRuleView = {
  id: 'r-salary',
  draft: {
    type: 'income',
    walletId: 'w-bank',
    categoryId: 'cat-salary',
    amount: 25_000_000,
    tags: [],
    note: null,
  },
  schedule: {
    unit: 'month',
    every: 1,
    monthDay: 'last',
    startDate: '2026-01-31',
    end: { kind: 'never' },
  },
  askMe: false,
  status: 'active',
  pausedReason: null,
  nextDueOn: '2026-11-30',
  lastConfirmedOn: '2026-10-31',
};

const transferRule: RecurringRuleView = {
  id: 'r-xfer',
  draft: {
    type: 'transfer',
    walletId: 'w-bank',
    toWalletId: 'w-save',
    amount: 3_000_000,
    tags: [],
    note: null,
  },
  schedule: {
    unit: 'month',
    every: 1,
    monthDay: 4,
    startDate: '2026-01-04',
    end: { kind: 'never' },
  },
  askMe: false,
  status: 'active',
  pausedReason: null,
  nextDueOn: '2026-12-04',
  lastConfirmedOn: '2026-11-04',
};

const pausedRule: RecurringRuleView = {
  id: 'r-gym',
  draft: {
    type: 'expense',
    walletId: 'w-bank',
    categoryId: 'cat-gym',
    amount: 500_000,
    tags: [],
    note: null,
  },
  schedule: {
    unit: 'month',
    every: 1,
    monthDay: 1,
    startDate: '2026-01-01',
    end: { kind: 'never' },
  },
  askMe: false,
  status: 'paused',
  pausedReason: 'missing_wallet',
  nextDueOn: '2026-12-01',
  lastConfirmedOn: '2026-10-01',
};

const occurrenceItem: PlannedItemView = {
  id: 'p-occ',
  kind: 'recurring_occurrence',
  ruleId: 'r-elec',
  dueOn: '2026-11-20',
  draft: elecRule.draft,
  status: 'waiting',
  meta: null,
  createdOn: '2026-11-20',
};

const buyOccurrenceItem: PlannedItemView = {
  id: 'p-buy',
  kind: 'recurring_occurrence',
  ruleId: null,
  dueOn: '2026-11-25',
  draft: {
    type: 'buy',
    walletId: 'w-bank',
    assetId: 'asset-etf',
    amount: 5_000_000,
    tags: [],
    note: null,
  },
  status: 'waiting',
  meta: null,
  createdOn: '2026-11-25',
};

const checkInItem: PlannedItemView = {
  id: 'p-check',
  kind: 'recurring_checkin',
  ruleId: 'r-rent',
  dueOn: '2026-11-27',
  draft: null,
  status: 'waiting',
  meta: { pausesAfter: { occurrences: 3 } },
  createdOn: '2026-11-27',
};

const pausedNoticeItem: PlannedItemView = {
  id: 'p-paused',
  kind: 'recurring_paused',
  ruleId: 'r-gym',
  dueOn: '2026-11-27',
  draft: null,
  status: 'waiting',
  meta: { reason: 'checkin' },
  createdOn: '2026-11-27',
};

const suggestionItem: PlannedItemView = {
  id: 'p-sug',
  kind: 'rule_suggestion',
  ruleId: null,
  dueOn: '2026-11-28',
  draft: {
    type: 'expense',
    walletId: 'w-bank',
    categoryId: 'cat-net',
    amount: 250_000,
    tags: [],
    note: null,
  },
  status: 'waiting',
  meta: {
    pattern: {
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-12-05',
        end: { kind: 'never' },
      },
      amount: 250_000,
      categoryId: 'cat-net',
      walletId: 'w-bank',
      type: 'expense',
      count: 3,
    },
  },
  createdOn: '2026-11-28',
};

const unknownItem: PlannedItemView = {
  id: 'p-unknown',
  kind: 'future_feature_kind',
  ruleId: null,
  dueOn: '2026-11-28',
  draft: null,
  status: 'waiting',
  meta: null,
  createdOn: '2026-11-28',
};

function stubRecurringApis(opts: {
  me?: typeof meOn;
  rules?: RecurringRuleView[];
  planned?: PlannedItemView[];
  extra?: Record<string, unknown>;
}) {
  return mockApi({
    'GET /api/me': opts.me ?? meOn,
    'GET /api/me/personal/wallets': { wallets },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/assets': { assets },
    'GET /api/me/personal/recurring/rules': { rules: opts.rules ?? [] },
    'GET /api/me/personal/planned': { items: opts.planned ?? [] },
    'GET /api/me/ledger': ledger,
    'GET /api/me/people/summary': peopleSummary,
    'GET /api/trips/t-led': ledgerView(),
    'GET /api/trips': { trips: [] },
    ...opts.extra,
  });
}

function renderRecurringVi(route = '/recurring') {
  const utils = renderAt(<App />, { route, path: '*' });
  act(() => {
    setLang('vi', false);
  });
  return utils;
}

describe('RecurringScreen', () => {
  it('renders sections in order (waiting, upcoming, rules), shows "Chưa tính vào số dư", groups upcoming by date, and excludes transfers from totals', async () => {
    stubRecurringApis({
      rules: [rentRule, elecRule, salaryRule, transferRule, pausedRule],
      planned: [occurrenceItem, checkInItem, unknownItem],
    });
    renderRecurringVi();

    await screen.findByTestId('recurring-waiting');

    const waiting = screen.getByTestId('recurring-waiting');
    const upcoming = screen.getByTestId('recurring-upcoming');
    const rules = screen.getByTestId('recurring-rules');

    // DOM order: waiting -> upcoming -> rules
    expect(waiting.compareDocumentPosition(upcoming) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(upcoming.compareDocumentPosition(rules) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Waiting header and note
    expect(within(waiting).getByText('Chờ xác nhận · 2')).toBeInTheDocument();
    expect(within(waiting).getByText('Chưa tính vào số dư')).toBeInTheDocument();

    // Unknown kind renders nothing
    expect(screen.queryByTestId('planned-item-p-unknown')).not.toBeInTheDocument();

    // Upcoming totals: rent (6,000,000) + elec (850,000) = 6,850,000 out; salary = 25,000,000 in; transfer (3,000,000) NOT totalled
    const totalEl = screen.getByTestId('recurring-upcoming-total');
    expect(totalEl).toHaveTextContent('chi 6.850.000₫ · thu 25.000.000₫');

    // Date sub-labels in Vietnamese (2026-12-04 is Friday)
    expect(within(upcoming).getByText('Thứ Sáu, 4/12')).toBeInTheDocument();
    // Transfer row is still listed in upcoming
    expect(within(upcoming).getByText('Ví ngân hàng → Tiết kiệm')).toBeInTheDocument();

    // Header "+" links to /entries/new?repeat=1
    const addBtn = screen.getByTestId('recurring-add');
    expect(addBtn).toHaveAttribute('href', '/entries/new?repeat=1');
  });

  it('hides the waiting section when there are no waiting items', async () => {
    stubRecurringApis({
      rules: [rentRule],
      planned: [],
    });
    renderRecurringVi();

    await screen.findByTestId('recurring-rules');
    expect(screen.queryByTestId('recurring-waiting')).not.toBeInTheDocument();
    expect(screen.getByTestId('recurring-upcoming')).toBeInTheDocument();
  });

  it('calls confirm on Xác nhận with snackbar and calls skip on Bỏ qua', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.fn(() => Response.json({ ok: true, transactionId: 'tx-1' }));
    const skipSpy = vi.fn(() => Response.json({ ok: true }));

    stubRecurringApis({
      rules: [elecRule],
      planned: [occurrenceItem],
      extra: {
        'POST /api/me/personal/planned/p-occ/confirm': confirmSpy,
        'POST /api/me/personal/planned/p-occ/skip': skipSpy,
      },
    });
    renderRecurringVi();

    const card = await screen.findByTestId('planned-item-p-occ');
    await user.click(within(card).getByTestId('planned-confirm'));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Đã ghi Tiền điện');

    await user.click(within(card).getByTestId('planned-skip'));
    await waitFor(() => {
      expect(skipSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('renders buy occurrence with only "Nhập & xác nhận" (linking to entry form) and "Bỏ qua"', async () => {
    stubRecurringApis({
      rules: [rentRule],
      planned: [buyOccurrenceItem],
    });
    renderRecurringVi();

    const card = await screen.findByTestId('planned-item-p-buy');
    expect(card).toHaveTextContent('Mua E1VFVN30');
    const editBtn = within(card).getByTestId('planned-edit');
    expect(editBtn).toHaveTextContent('Nhập & xác nhận');
    expect(editBtn).toHaveAttribute('href', '/entries/new?planned=p-buy');
    expect(within(card).getByTestId('planned-skip')).toHaveTextContent('Bỏ qua');
    expect(within(card).queryByTestId('planned-confirm')).not.toBeInTheDocument();
  });

  it('renders check-in with Vẫn dùng / Tạm dừng and paused notice with Tiếp tục / Bỏ qua', async () => {
    const user = userEvent.setup();
    const confirmCheckSpy = vi.fn(() => Response.json({ ok: true, transactionId: null }));
    const skipCheckSpy = vi.fn(() => Response.json({ ok: true }));
    const confirmPausedSpy = vi.fn(() => Response.json({ ok: true, transactionId: null }));

    stubRecurringApis({
      rules: [rentRule, pausedRule],
      planned: [checkInItem, pausedNoticeItem],
      extra: {
        'POST /api/me/personal/planned/p-check/confirm': confirmCheckSpy,
        'POST /api/me/personal/planned/p-check/skip': skipCheckSpy,
        'POST /api/me/personal/planned/p-paused/confirm': confirmPausedSpy,
      },
    });
    renderRecurringVi();

    const checkCard = await screen.findByTestId('planned-item-p-check');
    expect(checkCard).toHaveTextContent('Tiền nhà còn dùng không?');
    expect(within(checkCard).getByTestId('planned-confirm')).toHaveTextContent('Vẫn dùng');
    expect(within(checkCard).getByTestId('planned-skip')).toHaveTextContent('Tạm dừng');

    await user.click(within(checkCard).getByTestId('planned-confirm'));
    await waitFor(() => expect(confirmCheckSpy).toHaveBeenCalledTimes(1));

    await user.click(within(checkCard).getByTestId('planned-skip'));
    await waitFor(() => expect(skipCheckSpy).toHaveBeenCalledTimes(1));

    const pausedCard = screen.getByTestId('planned-item-p-paused');
    expect(pausedCard).toHaveTextContent('Đã tạm dừng Phòng gym');
    expect(within(pausedCard).getByTestId('planned-confirm')).toHaveTextContent('Tiếp tục');
    expect(within(pausedCard).getByTestId('planned-skip')).toHaveTextContent('Bỏ qua');

    await user.click(within(pausedCard).getByTestId('planned-confirm'));
    await waitFor(() => expect(confirmPausedSpy).toHaveBeenCalledTimes(1));
  });

  it('renders rule suggestion with Tạo quy tắc (creates rule + confirms) and Không', async () => {
    const user = userEvent.setup();
    const createRuleSpy = vi.fn(() => Response.json({ rule: rentRule }));
    const confirmSugSpy = vi.fn(() => Response.json({ ok: true, transactionId: null }));

    stubRecurringApis({
      rules: [rentRule],
      planned: [suggestionItem],
      extra: {
        'POST /api/me/personal/recurring/rules': createRuleSpy,
        'POST /api/me/personal/planned/p-sug/confirm': confirmSugSpy,
      },
    });
    renderRecurringVi();

    const sugCard = await screen.findByTestId('planned-item-p-sug');
    expect(sugCard).toHaveTextContent('Tự ghi Internet mỗi tháng?');
    expect(within(sugCard).getByTestId('planned-confirm')).toHaveTextContent('Tạo quy tắc');
    expect(within(sugCard).getByTestId('planned-skip')).toHaveTextContent('Không');

    await user.click(within(sugCard).getByTestId('planned-confirm'));
    await waitFor(() => {
      expect(createRuleSpy).toHaveBeenCalledTimes(1);
      expect(confirmSugSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('renders paused rule with Tiếp tục button that calls resume', async () => {
    const user = userEvent.setup();
    const resumeSpy = vi.fn(() =>
      Response.json({ rule: { ...pausedRule, status: 'active', pausedReason: null } }),
    );

    stubRecurringApis({
      rules: [pausedRule],
      planned: [],
      extra: {
        'POST /api/me/personal/recurring/rules/r-gym/resume': resumeSpy,
      },
    });
    renderRecurringVi();

    const row = await screen.findByTestId('rule-row-r-gym');
    expect(row).toHaveTextContent('Đã tạm dừng · Ví đã bị xóa');
    const resumeBtn = within(row).getByTestId('rule-resume-r-gym');
    expect(resumeBtn).toHaveTextContent('Tiếp tục');

    await user.click(resumeBtn);
    await waitFor(() => {
      expect(resumeSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('renders empty state when there are no rules and nothing waiting', async () => {
    stubRecurringApis({ rules: [], planned: [] });
    renderRecurringVi();

    const cta = await screen.findByTestId('recurring-empty-add');
    expect(cta).toHaveTextContent('Thêm quy tắc');
    expect(cta).toHaveAttribute('href', '/entries/new?repeat=1');
    expect(screen.getByText('Chưa có khoản định kỳ')).toBeInTheDocument();
  });

  it('is unreachable when personalArea is switched off', async () => {
    stubRecurringApis({ me: meOff, rules: [rentRule], planned: [occurrenceItem] });
    renderRecurringVi('/recurring');

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/trips');
    });
    expect(screen.queryByTestId('recurring-rules')).not.toBeInTheDocument();
  });
});
