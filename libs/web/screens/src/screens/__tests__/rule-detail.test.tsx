import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CategoryView,
  EntryView,
  RecurringRuleView,
  WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt, mockApi } from '../../test/render';
import { App } from '../../App';

function renderVi(route: string) {
  renderAt(<App />, { route });
  act(() => setLang('vi'));
}

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
];

const categories: CategoryView[] = [
  { id: 'cat-rent', parentId: null, type: 'expense', name: 'Tiền nhà', icon: 'home', hidden: false, sortOrder: 0 },
  { id: 'cat-gym', parentId: null, type: 'expense', name: 'Phòng gym', icon: 'dumbbell', hidden: false, sortOrder: 1 },
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
    monthDay: 5,
    startDate: '2026-01-05',
    end: { kind: 'never' },
  },
  askMe: false,
  status: 'active',
  pausedReason: null,
  nextDueOn: '2026-12-05',
  lastConfirmedOn: '2026-11-05',
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

const rentEntries: EntryView[] = [
  {
    id: 'tx-nov',
    walletId: 'w-bank',
    type: 'expense',
    amount: 6_000_000,
    currency: 'VND',
    categoryId: 'cat-rent',
    assetId: null,
    quantity: null,
    transferId: null,
    counterpartWalletId: null,
    date: '2026-11-05',
    time: null,
    note: 'Tiền nhà tháng 11',
    tags: [],
    excludeFromReports: false,
    source: 'recurring',
    ruleId: 'r-rent',
    beforeStart: false,
    createdAt: '2026-11-05T00:15:00.000Z',
  },
  {
    id: 'tx-oct',
    walletId: 'w-bank',
    type: 'expense',
    amount: 6_000_000,
    currency: 'VND',
    categoryId: 'cat-rent',
    assetId: null,
    quantity: null,
    transferId: null,
    counterpartWalletId: null,
    date: '2026-10-05',
    time: null,
    note: 'Tiền nhà tháng 10',
    tags: [],
    excludeFromReports: false,
    source: 'recurring',
    ruleId: 'r-rent',
    beforeStart: false,
    createdAt: '2026-10-05T00:15:00.000Z',
  },
];

describe('RuleDetailScreen', () => {
  it('shows schedule in words, amount, meta line, edit link, and recorded rows', async () => {
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/recurring/rules': { rules: [rentRule] },
      'GET /api/me/personal/wallets': { wallets },
      'GET /api/me/personal/categories': { categories, recentIds: [] },
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/me/personal/transactions': {
        rows: rentEntries.map((entry) => ({ kind: 'entry', entry })),
        totals: [],
      },
    });

    renderVi('/recurring/r-rent');

    const summary = await screen.findByTestId('rule-summary-card');
    expect(within(summary).getByText('Chi · Ngày 5 mỗi tháng')).toBeInTheDocument();
    expect(within(summary).getByTestId('rule-summary-amount')).toHaveTextContent('−6.000.000₫');
    expect(within(summary).getByTestId('rule-status-line')).toHaveTextContent(
      'Lần tới 5/12 · Ví ngân hàng · đã xác nhận 5/11',
    );

    const editLink = screen.getByTestId('rule-edit');
    expect(editLink).toHaveAttribute('href', '/recurring/r-rent/edit');

    const recorded = screen.getByTestId('rule-recorded');
    expect(within(recorded).getByTestId('tx-row-tx-nov')).toHaveAttribute('href', '/entries/tx-nov');
    expect(within(recorded).getByTestId('tx-row-tx-oct')).toHaveAttribute('href', '/entries/tx-oct');
  });

  it('Tạm dừng calls pause endpoint', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/recurring/rules': { rules: [rentRule] },
      'GET /api/me/personal/wallets': { wallets },
      'GET /api/me/personal/categories': { categories, recentIds: [] },
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/me/personal/transactions': { rows: [], totals: [] },
      'POST /api/me/personal/recurring/rules/r-rent/pause': {
        rule: { ...rentRule, status: 'paused', pausedReason: 'manual' },
      },
    });

    renderVi('/recurring/r-rent');

    const pauseBtn = await screen.findByTestId('rule-pause');
    expect(screen.getByTestId('rule-recorded-empty')).toHaveTextContent('Chưa ghi lần nào');

    await user.click(pauseBtn);

    await waitFor(() => {
      const pauseCall = api.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/recurring/rules/r-rent/pause',
      );
      expect(pauseCall).toBeDefined();
    });
  });

  it('Xóa asks to confirm in a sheet, calls delete and navigates to /recurring', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/recurring/rules': { rules: [rentRule] },
      'GET /api/me/personal/planned': { items: [] },
      'GET /api/me/personal/wallets': { wallets },
      'GET /api/me/personal/categories': { categories, recentIds: [] },
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/me/personal/transactions': { rows: [], totals: [] },
      'DELETE /api/me/personal/recurring/rules/r-rent': { ok: true },
    });

    renderVi('/recurring/r-rent');

    const deleteBtn = await screen.findByTestId('rule-delete');
    await user.click(deleteBtn);

    const confirmBtn = await screen.findByTestId('rule-delete-confirm');
    expect(confirmBtn).toBeInTheDocument();

    await user.click(confirmBtn);

    await waitFor(() => {
      const delCall = api.calls.find(
        (c) => c.method === 'DELETE' && c.path === '/api/me/personal/recurring/rules/r-rent',
      );
      expect(delCall).toBeDefined();
    });

    await screen.findByTestId('recurring-add');
  });

  it('paused rule shows Tiếp tục and the paused reason', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/recurring/rules': { rules: [pausedRule] },
      'GET /api/me/personal/wallets': { wallets },
      'GET /api/me/personal/categories': { categories, recentIds: [] },
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/me/personal/transactions': { rows: [], totals: [] },
      'POST /api/me/personal/recurring/rules/r-gym/resume': {
        rule: { ...pausedRule, status: 'active', pausedReason: null },
      },
    });

    renderVi('/recurring/r-gym');

    const statusLine = await screen.findByTestId('rule-status-line');
    expect(statusLine).toHaveTextContent('Đã tạm dừng · Ví đã bị xóa');

    const resumeBtn = screen.getByTestId('rule-resume');
    await user.click(resumeBtn);

    await waitFor(() => {
      const resumeCall = api.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/recurring/rules/r-gym/resume',
      );
      expect(resumeCall).toBeDefined();
    });
  });

  it('shows not-found EmptyState with link back to /recurring for unknown id', async () => {
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/recurring/rules': { rules: [rentRule] },
      'GET /api/me/personal/wallets': { wallets },
      'GET /api/me/personal/categories': { categories, recentIds: [] },
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/me/personal/transactions': { rows: [], totals: [] },
    });

    renderVi('/recurring/does-not-exist');

    const notFound = await screen.findByTestId('rule-not-found');
    expect(within(notFound).getByText('Không tìm thấy quy tắc')).toBeInTheDocument();
    expect(within(notFound).getByRole('link')).toHaveAttribute('href', '/recurring');
  });
});
