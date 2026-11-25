import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AssetView, BookRow, CategoryView, EntryView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { renderAt } from '../../test/render';
import { TransactionDetailContent } from '../../screens/TransactionDetail';
import { TransactionFilters } from '../TransactionFilters';
import { TransactionRow } from '../TransactionRow';
import { formatFullCalendarDate } from '../transactions/rowHelpers';

const walletCash: WalletDetailView = {
  id: 'w-cash',
  name: 'Tiền mặt',
  currency: 'VND',
  balance: 1_000_000,
  isDefault: true,
  kind: 'everyday',
  startAmount: 1_000_000,
  startDate: '2026-01-01',
  startCostVnd: null,
  vndValue: null,
  icon: null,
  sortOrder: 0,
  archived: false,
  entryCount: 1,
};

const walletBank: WalletDetailView = {
  ...walletCash,
  id: 'w-bank',
  name: 'Vietcombank',
  isDefault: false,
  sortOrder: 1,
};

const btcAsset: AssetView = {
  id: 'a-btc',
  name: 'BTC',
  unit: '',
  groupName: 'Crypto',
  decimals: 4,
  icon: 'crypto:btc',
  hidden: false,
  sortOrder: 0,
  entryCount: 1,
};

const foodCategory: CategoryView = {
  id: 'c-food',
  parentId: null,
  type: 'expense',
  name: 'Ăn uống',
  icon: 'utensils',
  hidden: false,
  sortOrder: 0,
};

const salaryCategory: CategoryView = {
  id: 'c-salary',
  parentId: null,
  type: 'income',
  name: 'Lương',
  icon: 'wallet',
  hidden: false,
  sortOrder: 1,
};

function makeExpenseEntry(overrides: Partial<EntryView> = {}): EntryView {
  return {
    id: 'e-exp-1',
    walletId: 'w-cash',
    type: 'expense',
    amount: -45_000,
    currency: 'VND',
    categoryId: 'c-food',
    assetId: null,
    quantity: null,
    date: '2026-10-09',
    time: '14:05',
    note: 'Phở',
    tags: [],
    excludeFromReports: false,
    source: 'manual',
    counterpartWalletId: null,
    transferId: null,
    beforeStart: false,
    createdAt: '2026-10-09T14:05:00.000Z',
    ...overrides,
  };
}

function makeTradeEntry(overrides: Partial<EntryView> = {}): EntryView {
  return {
    id: 'e-buy-1',
    walletId: 'w-cash',
    type: 'buy',
    amount: -500_000,
    currency: 'VND',
    categoryId: null,
    assetId: 'a-btc',
    quantity: 100,
    date: '2026-10-09',
    time: '14:05',
    note: null,
    tags: [],
    excludeFromReports: false,
    source: 'manual',
    counterpartWalletId: null,
    transferId: null,
    beforeStart: false,
    createdAt: '2026-10-09T14:05:00.000Z',
    ...overrides,
  };
}

describe('Transaction list, detail, and filter polish (#132)', () => {
  it('formatFullCalendarDate formats ISO dates as dd/mm/yyyy and keeps non-ISO unchanged', () => {
    expect(formatFullCalendarDate('2026-10-09')).toBe('09/10/2026');
    expect(formatFullCalendarDate('09/10/2026')).toBe('09/10/2026');
  });

  it('TransactionDetail shows dd/mm/yyyy · time for trade entries', () => {
    renderAt(
      <TransactionDetailContent
        entry={makeTradeEntry({ date: '2026-10-09', time: '14:05' })}
        wallets={[walletCash]}
        categories={[foodCategory]}
        assets={[btcAsset]}
        onDone={vi.fn()}
      />,
    );
    act(() => setLang('vi'));

    expect(screen.getByText('09/10/2026 · 14:05')).toBeInTheDocument();
  });

  it("TransactionRow titleMode='detail' uses note, else wallet name, else Chi without repeating note in meta", () => {
    const withNoteRow: BookRow = {
      kind: 'entry',
      entry: makeExpenseEntry({ id: 'e-note', note: 'Phở', time: null }),
    };
    const noNoteRow: BookRow = {
      kind: 'entry',
      entry: makeExpenseEntry({ id: 'e-wallet', note: null, time: null }),
    };
    const neitherRow: BookRow = {
      kind: 'entry',
      entry: makeExpenseEntry({
        id: 'e-neither',
        walletId: 'w-missing',
        note: null,
        time: null,
      }),
    };

    renderAt(
      <>
        <TransactionRow
          row={withNoteRow}
          categories={[foodCategory]}
          wallets={[walletCash, walletBank]}
          titleMode="detail"
        />
        <TransactionRow
          row={noNoteRow}
          categories={[foodCategory]}
          wallets={[walletCash, walletBank]}
          titleMode="detail"
        />
        <TransactionRow
          row={neitherRow}
          categories={[foodCategory]}
          wallets={[walletCash, walletBank]}
          titleMode="detail"
        />
      </>,
    );
    act(() => setLang('vi'));

    const noteEl = screen.getByTestId('tx-row-e-note');
    expect(within(noteEl).getAllByText('Phở')).toHaveLength(1);
    expect(within(noteEl).queryByText('Ăn uống')).toBeNull();

    const walletEl = screen.getByTestId('tx-row-e-wallet');
    expect(within(walletEl).getByText('Tiền mặt')).toBeInTheDocument();
    expect(within(walletEl).queryByText('Ăn uống')).toBeNull();

    const neitherEl = screen.getByTestId('tx-row-e-neither');
    expect(within(neitherEl).getByText('Chi')).toBeInTheDocument();
    expect(within(neitherEl).queryByText('Ăn uống')).toBeNull();
  });

  it('TransactionRow default titleMode still shows category name', () => {
    const row: BookRow = {
      kind: 'entry',
      entry: makeExpenseEntry({ id: 'e-default', note: 'Phở' }),
    };

    renderAt(<TransactionRow row={row} categories={[foodCategory]} wallets={[walletCash]} />);
    act(() => setLang('vi'));

    const rowEl = screen.getByTestId('tx-row-e-default');
    expect(within(rowEl).getByText('Ăn uống')).toBeInTheDocument();
    expect(within(rowEl).getByText('Phở')).toBeInTheDocument();
  });

  it("TransactionFilters category pick groups into Chi and Thu sections below 'Tất cả danh mục'", async () => {
    const user = userEvent.setup();
    renderAt(
      <TransactionFilters
        open
        onClose={vi.fn()}
        value={{}}
        onApply={vi.fn()}
        wallets={[walletCash]}
        categories={[foodCategory, salaryCategory]}
        tags={[]}
      />,
    );
    act(() => setLang('vi'));

    await user.click(screen.getByTestId('tx-filter-row-category'));

    const allRow = await screen.findByTestId('tx-filter-category-all');
    const chiHeader = screen.getByTestId('tx-filter-category-section-expense');
    const thuHeader = screen.getByTestId('tx-filter-category-section-income');
    const foodRow = screen.getByTestId('tx-filter-category-c-food');
    const salaryRow = screen.getByTestId('tx-filter-category-c-salary');

    expect(chiHeader).toHaveTextContent('Chi');
    expect(thuHeader).toHaveTextContent('Thu');
    expect(chiHeader.tagName).not.toMatch(/^H[1-6]$/);
    expect(thuHeader.tagName).not.toMatch(/^H[1-6]$/);

    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(follows(allRow, chiHeader)).toBe(true);
    expect(follows(chiHeader, foodRow)).toBe(true);
    expect(follows(foodRow, thuHeader)).toBe(true);
    expect(follows(thuHeader, salaryRow)).toBe(true);
  });
});
