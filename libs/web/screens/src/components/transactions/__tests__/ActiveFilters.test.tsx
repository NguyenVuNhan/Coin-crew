import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AssetView, CategoryView, WalletDetailView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { ActiveFilterPills } from '../../TransactionFilters';
import { NoMatch } from '../NoMatch';

function makeWallet(id: string, name: string): WalletDetailView {
  return {
    id,
    name,
    currency: 'VND',
    balance: 0,
    isDefault: false,
    kind: 'everyday',
    startAmount: 0,
    startDate: '2026-01-01',
    startCostVnd: null,
    vndValue: null,
    icon: null,
    sortOrder: 0,
    archived: false,
    entryCount: 0,
  };
}

function makeCategory(id: string, name: string): CategoryView {
  return {
    id,
    parentId: null,
    type: 'expense',
    name,
    icon: 'utensils',
    hidden: false,
    sortOrder: 0,
  };
}

function makeAsset(id: string, name: string): AssetView {
  return {
    id,
    name,
    unit: 'unit',
    groupName: 'Other',
    decimals: 0,
    hidden: false,
    sortOrder: 0,
    entryCount: 0,
  };
}

const wallets = [makeWallet('w-1', 'Tiền mặt')];
const categories = [makeCategory('c-food', 'Ăn uống')];
const assets = [makeAsset('a-gold', 'Vàng SJC')];

beforeEach(() => {
  setLang('vi', false);
});

describe('ActiveFilterPills', () => {
  it('q, tag and range get no pills', () => {
    render(
      <ActiveFilterPills
        filters={{
          q: 'cà phê',
          tagId: 't-1',
          from: '2026-11-01',
          to: '2026-11-15',
          type: 'expense',
          walletId: 'w-1',
          categoryId: 'c-food',
          assetId: 'a-gold',
        }}
        wallets={wallets}
        categories={categories}
        assets={assets}
        hasAnyFilter={true}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('tx-filter-pill-q')).toBeNull();
    expect(screen.queryByTestId('tx-filter-pill-tagId')).toBeNull();
    expect(screen.queryByTestId('tx-filter-pill-from')).toBeNull();
    expect(screen.queryByTestId('tx-filter-pill-to')).toBeNull();

    expect(screen.getByTestId('tx-filter-pill-type')).toBeInTheDocument();
    expect(screen.getByTestId('tx-filter-pill-walletId')).toHaveTextContent('Tiền mặt');
    expect(screen.getByTestId('tx-filter-pill-categoryId')).toHaveTextContent('Ăn uống');
    expect(screen.getByTestId('tx-filter-pill-assetId')).toHaveTextContent('Vàng SJC');
  });

  it('a wallet pill removes the wallet', () => {
    const onRemove = vi.fn();
    render(
      <ActiveFilterPills
        filters={{ walletId: 'w-1' }}
        wallets={wallets}
        categories={categories}
        assets={assets}
        hasAnyFilter={true}
        onRemove={onRemove}
        onClearAll={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('tx-filter-pill-walletId'));
    expect(onRemove).toHaveBeenCalledWith('walletId');
  });

  it('Xóa tất cả shows when only q is set and clears everything', () => {
    const onClearAll = vi.fn();
    render(
      <ActiveFilterPills
        filters={{ q: 'cà phê' }}
        wallets={wallets}
        categories={categories}
        assets={assets}
        hasAnyFilter={true}
        onRemove={vi.fn()}
        onClearAll={onClearAll}
      />,
    );

    expect(screen.getByTestId('tx-active-filters')).toBeInTheDocument();
    expect(screen.queryByTestId('tx-filter-pill-q')).toBeNull();

    const clearAll = screen.getByTestId('tx-clear-all');
    expect(clearAll).toHaveTextContent('Xóa tất cả');
    fireEvent.click(clearAll);
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('the row is hidden with no filters', () => {
    const { container } = render(
      <ActiveFilterPills
        filters={{}}
        wallets={wallets}
        categories={categories}
        assets={assets}
        hasAnyFilter={false}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('tx-active-filters')).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});

describe('NoMatch', () => {
  it('NoMatch has no card border and its button clears', () => {
    const onClear = vi.fn();
    render(<NoMatch onClear={onClear} />);

    const root = screen.getByTestId('tx-no-match');
    expect(root.className).not.toContain('bg-card');
    expect(root.className).not.toContain('border');
    expect(screen.getByText('Không có giao dịch nào khớp bộ lọc.')).toBeInTheDocument();

    const btn = screen.getByTestId('tx-clear-filters');
    expect(btn).toHaveTextContent('Xóa bộ lọc');
    fireEvent.click(btn);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
