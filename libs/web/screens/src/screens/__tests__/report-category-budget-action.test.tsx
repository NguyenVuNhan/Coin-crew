import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import {
  UNCATEGORIZED_CATEGORY_ID,
  type BudgetDef,
  type CategoryView,
  type SyncEntryRow,
  type WalletDetailView,
} from '@cc/core';
import { setLang } from '@cc/web-i18n';
import type { TxCopyStatus } from '@cc/web-data-access/txCopy/hooks';
import type { TxCopySnapshot } from '@cc/web-data-access/txCopy/store';
import type { GroupCopySnapshot } from '@cc/web-data-access/txCopy/groupCopy';
import { renderAt, mockApi } from '../../test/render';
import { ReportCategoryScreen } from '../ReportCategoryScreen';

const MOCK_TODAY = '2026-11-26';

let mockTxCopyState: { status: TxCopyStatus; snapshot: TxCopySnapshot | null } = {
  status: 'unavailable',
  snapshot: null,
};

let mockGroupCopyState: {
  status: 'opening' | 'ready' | 'unavailable';
  snapshot: GroupCopySnapshot | null;
} = {
  status: 'unavailable',
  snapshot: null,
};

vi.mock('@cc/web-util/localDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-util/localDate')>();
  return {
    ...actual,
    todayLocal: () => MOCK_TODAY,
    currentMonthLocal: () => '2026-11',
  };
});

vi.mock('@cc/web-data-access/txCopy/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-data-access/txCopy/hooks')>();
  return {
    ...actual,
    useTxCopy: () => mockTxCopyState,
  };
});

vi.mock('@cc/web-data-access/txCopy/groupCopy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cc/web-data-access/txCopy/groupCopy')>();
  return {
    ...actual,
    useGroupCopy: () => mockGroupCopyState,
  };
});

beforeEach(() => {
  localStorage.clear();
  mockTxCopyState = { status: 'unavailable', snapshot: null };
  mockGroupCopyState = { status: 'unavailable', snapshot: null };
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  setLang('en');
});

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
  entryCount: 5,
  excludeFromReports: false,
};

const categories: CategoryView[] = [
  { id: 'cat-food', parentId: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', hidden: false, sortOrder: 0 },
  { id: 'cat-salary', parentId: null, type: 'income', name: 'Lương', icon: 'coins', hidden: false, sortOrder: 1 },
];

function syncEntry(
  overrides: Partial<SyncEntryRow> & Pick<SyncEntryRow, 'id' | 'type' | 'amount' | 'date'>,
): SyncEntryRow {
  return {
    walletId: 'w-cash',
    categoryId: null,
    assetId: null,
    quantity: null,
    transferId: null,
    counterpartWalletId: null,
    time: null,
    note: null,
    tagIds: [],
    excludeFromReports: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    syncVersion: 1,
    ...overrides,
  };
}

const entries: SyncEntryRow[] = [
  syncEntry({
    id: 'e-nov',
    type: 'expense',
    amount: 500_000,
    date: '2026-11-15',
    note: 'Bún bò',
    categoryId: 'cat-food',
  }),
  syncEntry({
    id: 'e-oct',
    type: 'expense',
    amount: 1_230_000,
    date: '2026-10-12',
    note: 'Cơm trưa',
    categoryId: 'cat-food',
  }),
  syncEntry({
    id: 'e-inc',
    type: 'income',
    amount: 15_000_000,
    date: '2026-11-05',
    note: 'Lương tháng 11',
    categoryId: 'cat-salary',
  }),
  syncEntry({
    id: 'e-uncat',
    type: 'expense',
    amount: 200_000,
    date: '2026-11-18',
    note: 'Khác',
    categoryId: null,
  }),
];

function setupCopy() {
  mockTxCopyState = {
    status: 'ready',
    snapshot: {
      entries,
      watermark: '2026-11-26T00:00:00.000Z',
    } as unknown as TxCopySnapshot,
  };
  mockGroupCopyState = {
    status: 'ready',
    snapshot: {
      rows: [],
      watermark: '2026-11-26T00:00:00.000Z',
    } as unknown as GroupCopySnapshot,
  };
}

function mockCategoryReportApi(budgets: BudgetDef[]) {
  return mockApi({
    'GET /api/me/personal/wallets': { wallets: [cashWallet] },
    'GET /api/me/personal/categories': { categories },
    'GET /api/me/personal/tags': { tags: [] },
    'GET /api/me/personal/group-settings': { settings: { defaultGroupCategoryId: null, countLoans: false } },
    'GET /api/me/personal/budgets': { budgets },
  });
}

describe('ReportCategoryScreen budget action', () => {
  it('shows Đặt ngân sách with rounded-up last month amount and href for an unbudgeted expense category', async () => {
    setupCopy();
    mockCategoryReportApi([]);

    renderAt(<ReportCategoryScreen />, {
      route: '/reports/category/cat-food',
      path: '/reports/category/:categoryId',
    });
    setLang('vi', false);

    const action = await screen.findByTestId('report-category-budget-action');
    expect(action).toHaveTextContent('Đặt ngân sách cho Ăn uống · tháng trước 1.300.000₫');
    expect(action).toHaveAttribute(
      'href',
      '/budgets?new=1&categoryId=cat-food&amount=1300000',
    );
  });

  it('shows Xem ngân sách linking to /budgets/:id when the category already has a budget', async () => {
    setupCopy();
    const existingBudget: BudgetDef = {
      id: 'b-food',
      name: 'Ăn uống',
      target: { kind: 'category', categoryId: 'cat-food' },
      currency: 'VND',
      periodKind: 'month',
      monthStartDay: 1,
      from: null,
      to: null,
      excludedWalletIds: [],
      limits: [{ effectiveFrom: '2026-01-01', amount: 3_000_000 }],
      suggestionDismissedUntil: null,
      createdOn: '2026-01-01',
    };
    mockCategoryReportApi([existingBudget]);

    renderAt(<ReportCategoryScreen />, {
      route: '/reports/category/cat-food',
      path: '/reports/category/:categoryId',
    });
    setLang('vi', false);

    const action = await screen.findByTestId('report-category-budget-action');
    expect(action).toHaveTextContent('Xem ngân sách');
    expect(action).toHaveAttribute('href', '/budgets/b-food');
  });

  it('is absent for income categories', async () => {
    setupCopy();
    mockCategoryReportApi([]);

    renderAt(<ReportCategoryScreen />, {
      route: '/reports/category/cat-salary',
      path: '/reports/category/:categoryId',
    });

    await screen.findByTestId('category-drilldown-summary');
    expect(screen.queryByTestId('report-category-budget-action')).not.toBeInTheDocument();
  });

  it('is absent for synthetic categories such as uncategorized', async () => {
    setupCopy();
    mockCategoryReportApi([]);

    renderAt(<ReportCategoryScreen />, {
      route: `/reports/category/${UNCATEGORIZED_CATEGORY_ID}`,
      path: '/reports/category/:categoryId',
    });

    await screen.findByTestId('category-drilldown-summary');
    expect(screen.queryByTestId('report-category-budget-action')).not.toBeInTheDocument();
  });
});
