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
import { TransactionRow } from '../../components/TransactionRow';

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
    balance: 20_000_000,
    isDefault: true,
    kind: 'everyday',
    startAmount: 20_000_000,
    startDate: '2026-01-01',
    startCostVnd: null,
    vndValue: 20_000_000,
    icon: 'bank',
    sortOrder: 0,
    archived: false,
    entryCount: 5,
    excludeFromReports: false,
  },
];

const categories: CategoryView[] = [
  { id: 'cat-rent', parentId: null, type: 'expense', name: 'Tiền nhà', icon: 'home', hidden: false, sortOrder: 0 },
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

const recurringEntry: EntryView = {
  id: 'tx-rec-1',
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
  note: null,
  tags: [],
  excludeFromReports: false,
  source: 'recurring',
  ruleId: 'r-rent',
  beforeStart: false,
  createdAt: '2026-11-05T00:15:00.000Z',
};

const manualEntry: EntryView = {
  ...recurringEntry,
  id: 'tx-man-1',
  source: 'manual',
  ruleId: null,
};

const adjustmentEntry: EntryView = {
  ...recurringEntry,
  id: 'tx-adj-1',
  source: 'adjustment',
  ruleId: null,
};

describe('TransactionDetail recurring mark and repeat action', () => {
  it('shows recurring rule mark and links to /recurring/<ruleId>', async () => {
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/transactions': {
        rows: [{ kind: 'entry', entry: recurringEntry }],
        totals: [],
      },
      'GET /api/me/personal/wallets': { wallets },
      'GET /api/me/personal/categories': { categories, recentIds: [] },
      'GET /api/me/personal/recurring/rules': { rules: [rentRule] },
    });

    renderVi('/entries/tx-rec-1');

    const ruleRow = await screen.findByTestId('tx-detail-rule');
    expect(ruleRow.tagName).toBe('A');
    expect(ruleRow).toHaveAttribute('href', '/recurring/r-rent');
    expect(ruleRow).toHaveTextContent('Tự ghi theo quy tắc “Tiền nhà”');
    expect(ruleRow).toHaveTextContent('Ngày 5 mỗi tháng');
    expect(screen.queryByTestId('tx-detail-repeat')).not.toBeInTheDocument();
  });

  it('shows "Quy tắc đã bị xóa" and no link when the rule no longer exists', async () => {
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/transactions': {
        rows: [{ kind: 'entry', entry: recurringEntry }],
        totals: [],
      },
      'GET /api/me/personal/wallets': { wallets },
      'GET /api/me/personal/categories': { categories, recentIds: [] },
      'GET /api/me/personal/recurring/rules': { rules: [] },
    });

    renderVi('/entries/tx-rec-1');

    const ruleRow = await screen.findByTestId('tx-detail-rule');
    expect(ruleRow.tagName).not.toBe('A');
    expect(ruleRow).toHaveTextContent('Quy tắc đã bị xóa');
    expect(within(ruleRow).queryByRole('link')).not.toBeInTheDocument();
  });

  it('"Lặp lại giao dịch này" calls POST /api/me/personal/recurring/rules/from/<txId> and navigates', async () => {
    const user = userEvent.setup();
    const createdRule: RecurringRuleView = { ...rentRule, id: 'r-new' };
    const api = mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/transactions': {
        rows: [{ kind: 'entry', entry: manualEntry }],
        totals: [],
      },
      'GET /api/me/personal/wallets': { wallets },
      'GET /api/me/personal/categories': { categories, recentIds: [] },
      'GET /api/me/personal/assets': { assets: [] },
      'GET /api/me/personal/recurring/rules': { rules: [createdRule] },
      'POST /api/me/personal/recurring/rules/from/tx-man-1': { rule: createdRule },
    });

    renderVi('/entries/tx-man-1');

    const repeatBtn = await screen.findByTestId('tx-detail-repeat');
    expect(repeatBtn).toHaveTextContent('Lặp lại giao dịch này');
    await user.click(repeatBtn);

    await waitFor(() => {
      const postCall = api.calls.find(
        (c) => c.method === 'POST' && c.path === '/api/me/personal/recurring/rules/from/tx-man-1',
      );
      expect(postCall).toBeDefined();
    });

    await screen.findByTestId('rule-summary-card');
  });

  it('does not show repeat action on adjustment entries', async () => {
    mockApi({
      'GET /api/me': meOn,
      'GET /api/me/personal/transactions': {
        rows: [{ kind: 'entry', entry: adjustmentEntry }],
        totals: [],
      },
      'GET /api/me/personal/wallets': { wallets },
      'GET /api/me/personal/categories': { categories, recentIds: [] },
    });

    renderVi('/entries/tx-adj-1');

    await screen.findByTestId('tx-detail-amount');
    expect(screen.queryByTestId('tx-detail-repeat')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tx-detail-rule')).not.toBeInTheDocument();
  });

  it('shows "Lặp lại" on a list row of a recurring transaction, not on a manual one', () => {
    renderAt(
      <div>
        <TransactionRow
          row={{ kind: 'entry', entry: recurringEntry }}
          wallets={wallets}
          categories={categories}
          showDate
        />
        <TransactionRow
          row={{ kind: 'entry', entry: manualEntry }}
          wallets={wallets}
          categories={categories}
          showDate
        />
      </div>,
      { route: '/transactions' },
    );
    act(() => setLang('vi'));

    const recRow = screen.getByTestId('tx-row-tx-rec-1');
    expect(within(recRow).getByTestId('tx-row-recurring-mark')).toHaveTextContent('Lặp lại');

    const manRow = screen.getByTestId('tx-row-tx-man-1');
    expect(within(manRow).queryByTestId('tx-row-recurring-mark')).not.toBeInTheDocument();
  });
});
