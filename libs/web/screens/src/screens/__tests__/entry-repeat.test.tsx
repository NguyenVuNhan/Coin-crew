import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import type {
  AssetView,
  CategoriesResponse,
  CategoryView,
  RecurringRuleInput,
  RecurringRuleView,
  TripView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { browserPlatform, PlatformProvider } from '@cc/web-platform';
import { mockApi } from '../../test/render';
import { finishAmount, openDetails } from '../../test/entry';
import { NavHistoryProvider } from '../../lib/navHistory';
import { EntryPage } from '../EntryPage';
import { UndoSnackbarHost, hideUndo } from '../../components/UndoSnackbarHost';

function mockMousePointerMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(hover: hover) and (pointer: fine)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

beforeEach(() => {
  localStorage.clear();
  hideUndo();
  setLang('vi');
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  hideUndo();
});

const everydayWallet: WalletDetailView = {
  id: 'w-vnd',
  name: 'Ví ngân hàng',
  currency: 'VND',
  balance: 10_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 10_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 10_000_000,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 0,
};

const investmentWallet: WalletDetailView = {
  id: 'w-inv',
  name: 'TCBS',
  currency: 'VND',
  balance: 50_000_000,
  isDefault: false,
  kind: 'investment',
  startAmount: 50_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: 50_000_000,
  icon: null,
  sortOrder: 1,
  archived: false,
  entryCount: 0,
};

const rentCat: CategoryView = {
  id: 'cat-rent',
  type: 'expense',
  name: 'Tiền nhà',
  icon: 'house',
  parentId: null,
  sortOrder: 0,
  hidden: false,
};

const salaryCat: CategoryView = {
  id: 'cat-salary',
  type: 'income',
  name: 'Lương',
  icon: 'wallet',
  parentId: null,
  sortOrder: 0,
  hidden: false,
};

const categoriesResp: CategoriesResponse = {
  categories: [rentCat, salaryCat],
  recentIds: ['cat-rent', 'cat-salary'],
};

const etfAsset: AssetView = {
  id: 'asset-etf',
  name: 'E1VFVN30',
  unit: 'CCQ',
  groupName: 'ETF',
  decimals: 0,
  hidden: false,
  sortOrder: 0,
  entryCount: 0,
};

function directTripView(): TripView {
  return {
    trip: {
      id: 't-led',
      name: 'Quick expenses',
      currency: 'VND',
      fewestTransfers: true,
      archived: false,
      version: 1,
      total: 0,
      preset: 'direct',
    },
    me: {
      kind: 'member',
      participantId: 'led-o',
      participantPending: false,
      isOrganiser: true,
    },
    people: [
      { id: 'led-o', name: 'An', status: 'active', isMember: true, bank: 'none' },
    ],
    balances: { 'led-o': 0 },
    suggestions: [],
    expenses: [],
    payments: [],
    myBalance: null,
    approvals: [],
    links: null,
  };
}

function RuleDetailStub() {
  const { id } = useParams<{ id: string }>();
  return <div data-testid="rule-detail-route">Rule {id}</div>;
}

function renderEntryRoute(route: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <PlatformProvider platform={browserPlatform}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/recurring', route]} initialIndex={1}>
          <NavHistoryProvider>
            <UndoSnackbarHost />
            <Routes>
              <Route path="/entries/new" element={<EntryPage />} />
              <Route path="/entries/:id/edit" element={<EntryPage />} />
              <Route path="/recurring" element={<div data-testid="recurring-route">Recurring</div>} />
              <Route path="/recurring/:id" element={<RuleDetailStub />} />
              <Route path="/recurring/:id/edit" element={<EntryPage />} />
            </Routes>
          </NavHistoryProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </PlatformProvider>,
  );
}

function baseMocks(extra: Record<string, unknown> = {}) {
  return {
    'GET /api/me/ledger': { tripId: 't-led', ownerPid: 'led-o' },
    'GET /api/me/personal/wallets': { wallets: [everydayWallet, investmentWallet] },
    'GET /api/me/personal/categories': categoriesResp,
    'GET /api/me/personal/assets': { assets: [etfAsset] },
    'GET /api/me/personal/budgets': { budgets: [] },
    'GET /api/me/personal/budgets/progress': { rows: [] },
    'GET /api/trips/t-led': directTripView(),
    'GET /api/me/people/candidates': [],
    ...extra,
  };
}

describe('EntryPage — RepeatField and rule create/edit', () => {
  it('posts a monthly recurring rule and does not post a transaction', async () => {
    const user = userEvent.setup();
    const postedRules: RecurringRuleInput[] = [];
    let postedTx = false;

    mockApi(
      baseMocks({
        'POST /api/me/personal/transactions': () => {
          postedTx = true;
          return Response.json({ entries: [] });
        },
        'POST /api/me/personal/recurring/rules': (init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? '{}')) as RecurringRuleInput;
          postedRules.push(body);
          return Response.json(
            {
              rule: {
                id: 'rule-new-1',
                draft: body.draft,
                schedule: body.schedule,
                askMe: Boolean(body.askMe),
                status: 'active',
                pausedReason: null,
                nextDueOn: '2026-12-05',
                lastConfirmedOn: '2026-11-05',
              },
            },
            { status: 201 },
          );
        },
      }),
    );

    renderEntryRoute('/entries/new?type=expense');
    await finishAmount(user, '6000000');
    await user.click(await screen.findByTestId('category-tile-cat-rent'));
    await openDetails(user);

    // Set entry date to 2026-11-05
    fireEvent.change(screen.getByTestId('entry-date-picker'), {
      target: { value: '2026-11-05' },
    });

    await user.click(screen.getByTestId('entry-repeat'));
    expect(screen.getByTestId('repeat-option-month')).toHaveTextContent('Ngày 5 hàng tháng');
    await user.click(screen.getByTestId('repeat-option-month'));

    await user.click(screen.getByTestId('entry-save-btn'));

    expect(await screen.findByTestId('rule-detail-route')).toHaveTextContent('Rule rule-new-1');
    expect(postedTx).toBe(false);
    expect(postedRules[0]).toEqual({
      draft: {
        type: 'expense',
        walletId: 'w-vnd',
        amount: 6_000_000,
        categoryId: 'cat-rent',
        tags: [],
        note: null,
        excludeFromReports: false,
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-11-05',
        end: { kind: 'never' },
      },
      askMe: false,
    });
  });

  it('offers "Ngày cuối hàng tháng" on a month last day and posts monthDay "last"', async () => {
    const user = userEvent.setup();
    const postedRules: RecurringRuleInput[] = [];

    mockApi(
      baseMocks({
        'POST /api/me/personal/recurring/rules': (init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? '{}')) as RecurringRuleInput;
          postedRules.push(body);
          return Response.json(
            {
              rule: {
                id: 'rule-last',
                draft: body.draft,
                schedule: body.schedule,
                askMe: false,
                status: 'active',
                pausedReason: null,
                nextDueOn: '2026-12-31',
                lastConfirmedOn: '2026-11-30',
              },
            },
            { status: 201 },
          );
        },
      }),
    );

    renderEntryRoute('/entries/new?type=expense');
    await finishAmount(user, '500000');
    await user.click(await screen.findByTestId('category-tile-cat-rent'));
    await openDetails(user);

    fireEvent.change(screen.getByTestId('entry-date-picker'), {
      target: { value: '2026-11-30' },
    });

    await user.click(screen.getByTestId('entry-repeat'));
    expect(screen.getByTestId('repeat-option-month')).toHaveTextContent('Ngày cuối hàng tháng');
    await user.click(screen.getByTestId('repeat-option-month'));
    await user.click(screen.getByTestId('entry-save-btn'));

    await screen.findByTestId('rule-detail-route');
    expect(postedRules[0]?.schedule).toEqual({
      unit: 'month',
      every: 1,
      monthDay: 'last',
      startDate: '2026-11-30',
      end: { kind: 'never' },
    });
  });

  it('posts end { kind: "count", count: 12 } from custom schedule', async () => {
    const user = userEvent.setup();
    const postedRules: RecurringRuleInput[] = [];

    mockApi(
      baseMocks({
        'POST /api/me/personal/recurring/rules': (init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? '{}')) as RecurringRuleInput;
          postedRules.push(body);
          return Response.json(
            {
              rule: {
                id: 'rule-count',
                draft: body.draft,
                schedule: body.schedule,
                askMe: false,
                status: 'active',
                pausedReason: null,
                nextDueOn: '2026-12-10',
                lastConfirmedOn: '2026-11-10',
              },
            },
            { status: 201 },
          );
        },
      }),
    );

    renderEntryRoute('/entries/new?type=expense');
    await finishAmount(user, '250000');
    await user.click(await screen.findByTestId('category-tile-cat-rent'));
    await openDetails(user);

    fireEvent.change(screen.getByTestId('entry-date-picker'), {
      target: { value: '2026-11-10' },
    });

    await user.click(screen.getByTestId('entry-repeat'));
    await user.click(screen.getByTestId('repeat-option-custom'));
    const countInput = screen.getByTestId('repeat-end-count');
    await user.clear(countInput);
    await user.type(countInput, '12');
    await user.click(screen.getByTestId('repeat-done'));

    await user.click(screen.getByTestId('entry-save-btn'));
    await screen.findByTestId('rule-detail-route');

    expect(postedRules[0]?.schedule.end).toEqual({ kind: 'count', count: 12 });
  });

  it('posts weekly custom schedule with T2 + T4 as weekdays [1, 3]', async () => {
    const user = userEvent.setup();
    const postedRules: RecurringRuleInput[] = [];

    mockApi(
      baseMocks({
        'POST /api/me/personal/recurring/rules': (init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? '{}')) as RecurringRuleInput;
          postedRules.push(body);
          return Response.json(
            {
              rule: {
                id: 'rule-weekly',
                draft: body.draft,
                schedule: body.schedule,
                askMe: false,
                status: 'active',
                pausedReason: null,
                nextDueOn: '2026-11-04',
                lastConfirmedOn: '2026-11-02',
              },
            },
            { status: 201 },
          );
        },
      }),
    );

    renderEntryRoute('/entries/new?type=expense');
    await finishAmount(user, '150000');
    await user.click(await screen.findByTestId('category-tile-cat-rent'));
    await openDetails(user);

    // 2026-11-02 is Monday (1)
    fireEvent.change(screen.getByTestId('entry-date-picker'), {
      target: { value: '2026-11-02' },
    });

    await user.click(screen.getByTestId('entry-repeat'));
    await user.click(screen.getByTestId('repeat-option-custom'));
    await user.click(screen.getByTestId('repeat-unit-week'));
    await user.click(screen.getByTestId('repeat-weekday-3'));
    await user.click(screen.getByTestId('repeat-done'));

    await user.click(screen.getByTestId('entry-save-btn'));
    await screen.findByTestId('rule-detail-route');

    expect(postedRules[0]?.schedule.unit).toBe('week');
    expect(postedRules[0]?.schedule.weekdays).toEqual([1, 3]);
  });

  it('forces askMe on and disabled for a buy rule and posts askMe true without quantity', async () => {
    mockMousePointerMatchMedia();
    const user = userEvent.setup();
    const postedRules: RecurringRuleInput[] = [];

    mockApi(
      baseMocks({
        'POST /api/me/personal/recurring/rules': (init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? '{}')) as RecurringRuleInput;
          postedRules.push(body);
          return Response.json(
            {
              rule: {
                id: 'rule-buy',
                draft: body.draft,
                schedule: body.schedule,
                askMe: true,
                status: 'active',
                pausedReason: null,
                nextDueOn: '2026-12-15',
                lastConfirmedOn: '2026-11-15',
              },
            },
            { status: 201 },
          );
        },
      }),
    );

    renderEntryRoute('/entries/new?type=expense&tile=buy&wallet=w-inv');

    const amountInput = await screen.findByTestId('amount-input');
    await user.type(amountInput, '5000000');

    // Pick ETF asset
    await user.click(screen.getByTestId('entry-asset-row'));
    await user.click(await screen.findByTestId('asset-option-asset-etf'));

    // Open RepeatField → custom → verify askMe switch is checked and disabled
    await user.click(screen.getByTestId('entry-repeat'));
    await user.click(screen.getByTestId('repeat-option-custom'));

    const askSwitch = screen.getByTestId('repeat-askme');
    expect(askSwitch).toBeDisabled();
    expect(askSwitch).toHaveAttribute('data-state', 'checked');
    expect(screen.getByText('Mua tài sản luôn chờ bạn nhập số lượng.')).toBeInTheDocument();

    await user.click(screen.getByTestId('repeat-done'));

    // Quantity input is not required for buy rules
    const saveBtn = screen.getByTestId('entry-save-btn');
    expect(saveBtn).toBeEnabled();
    await user.click(saveBtn);

    await screen.findByTestId('rule-detail-route');
    expect(postedRules[0]?.askMe).toBe(true);
    expect(postedRules[0]?.draft).toEqual({
      type: 'buy',
      walletId: 'w-inv',
      assetId: 'asset-etf',
      amount: 5_000_000,
      tags: [],
      note: null,
    });
    expect('quantity' in (postedRules[0]?.draft ?? {})).toBe(false);
  });

  it('opens preset to monthly when ?repeat=1 is in the query string', async () => {
    mockMousePointerMatchMedia();
    mockApi(baseMocks());

    renderEntryRoute('/entries/new?repeat=1');
    const repeatRow = await screen.findByTestId('entry-repeat');
    expect(repeatRow).not.toHaveTextContent('Không lặp');
    expect(repeatRow.textContent).toMatch(/mỗi tháng/);
  });

  it('loads rule on /recurring/:id/edit and PATCHes it on save', async () => {
    mockMousePointerMatchMedia();
    const user = userEvent.setup();
    const patchedBodies: Partial<RecurringRuleInput>[] = [];

    const existingRule: RecurringRuleView = {
      id: 'rule-edit-1',
      draft: {
        type: 'expense',
        walletId: 'w-vnd',
        amount: 6_000_000,
        categoryId: 'cat-rent',
        tags: [],
        note: 'Tiền nhà tháng',
        excludeFromReports: false,
      },
      schedule: {
        unit: 'month',
        every: 1,
        monthDay: 5,
        startDate: '2026-10-05',
        end: { kind: 'never' },
      },
      askMe: false,
      status: 'active',
      pausedReason: null,
      nextDueOn: '2026-12-05',
      lastConfirmedOn: '2026-11-05',
    };

    mockApi(
      baseMocks({
        'GET /api/me/personal/recurring/rules': { rules: [existingRule] },
        'PATCH /api/me/personal/recurring/rules/rule-edit-1': (init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? '{}')) as Partial<RecurringRuleInput>;
          patchedBodies.push(body);
          return Response.json({ rule: { ...existingRule, ...body } });
        },
      }),
    );

    renderEntryRoute('/recurring/rule-edit-1/edit');

    expect(await screen.findByTestId('rule-edit-hint')).toHaveTextContent(
      'Thay đổi chỉ áp dụng cho các lần sau.',
    );
    expect(screen.getByTestId('rule-edit-title')).toHaveTextContent('Sửa quy tắc');

    // Date is read-only (no native date picker input)
    expect(screen.queryByTestId('entry-date-picker')).toBeNull();

    // "Không lặp" is not offered in edit mode
    await user.click(screen.getByTestId('entry-repeat'));
    expect(screen.queryByTestId('repeat-option-none')).toBeNull();
    await user.click(screen.getByTestId('repeat-option-day'));

    // Update amount
    const amountInput = screen.getByTestId('amount-input');
    await user.clear(amountInput);
    await user.type(amountInput, '6500000');

    await user.click(screen.getByTestId('entry-save-btn'));

    expect(await screen.findByTestId('rule-detail-route')).toHaveTextContent('Rule rule-edit-1');
    expect(patchedBodies[0]).toEqual({
      draft: {
        type: 'expense',
        walletId: 'w-vnd',
        amount: 6_500_000,
        categoryId: 'cat-rent',
        tags: [],
        note: 'Tiền nhà tháng',
        excludeFromReports: false,
      },
      schedule: {
        unit: 'day',
        every: 1,
        startDate: '2026-10-05',
        end: { kind: 'never' },
      },
      askMe: false,
    });
  });

  it('renders an EmptyState linking to /recurring for an unknown rule id on edit', async () => {
    mockApi(
      baseMocks({
        'GET /api/me/personal/recurring/rules': { rules: [] },
      }),
    );

    renderEntryRoute('/recurring/missing-id/edit');

    const empty = await screen.findByTestId('rule-edit-not-found');
    expect(empty).toHaveTextContent('Không tìm thấy quy tắc');
    expect(screen.getByTestId('rule-edit-back-recurring')).toHaveAttribute('href', '/recurring');
  });

  it('still posts a normal transaction when no repeat is set', async () => {
    const user = userEvent.setup();
    const postedTxBodies: unknown[] = [];
    let postedRule = false;

    mockApi(
      baseMocks({
        'POST /api/me/personal/transactions': (init?: RequestInit) => {
          postedTxBodies.push(JSON.parse(String(init?.body ?? '{}')));
          return Response.json(
            {
              entries: [
                {
                  id: 'tx-1',
                  walletId: 'w-vnd',
                  type: 'expense',
                  amount: 120_000,
                  currency: 'VND',
                  categoryId: 'cat-rent',
                  transferId: null,
                  counterpartWalletId: null,
                  date: '2026-11-28',
                  time: null,
                  note: null,
                  tags: [],
                  excludeFromReports: false,
                  source: 'manual',
                  beforeStart: false,
                  createdAt: '2026-11-28T00:00:00Z',
                },
              ],
            },
            { status: 201 },
          );
        },
        'POST /api/me/personal/recurring/rules': () => {
          postedRule = true;
          return Response.json({ rule: null });
        },
      }),
    );

    renderEntryRoute('/entries/new?type=expense');
    await finishAmount(user, '120000');
    await user.click(await screen.findByTestId('category-tile-cat-rent'));
    await user.click(screen.getByTestId('entry-save-btn'));

    await waitFor(() => expect(postedTxBodies.length).toBe(1));
    expect(postedRule).toBe(false);
    expect(postedTxBodies[0]).toMatchObject({
      type: 'expense',
      walletId: 'w-vnd',
      amount: 120_000,
      categoryId: 'cat-rent',
    });
  });
});
