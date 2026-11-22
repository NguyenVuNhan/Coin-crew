import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  AssetView,
  CategoryView,
  TagView,
  WalletDetailView,
} from '@cc/core';
import { renderAt } from '../../../test/render';
import {
  TransactionFilters,
  type GroupFilterOption,
  type TransactionFilterValues,
} from '../../TransactionFilters';

function makeWallet(id: string, name: string, archived = false): WalletDetailView {
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
    archived,
    entryCount: 0,
  };
}

function makeCategory(
  id: string,
  name: string,
  parentId: string | null = null,
): CategoryView {
  return {
    id,
    parentId,
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

function makeTag(id: string, name: string): TagView {
  return {
    id,
    name,
    useCount: 1,
  };
}

const baseWallets = [
  makeWallet('w-1', 'Tiền mặt'),
  makeWallet('w-2', 'Vietcombank'),
];

const baseCategories = [
  makeCategory('c-food', 'Ăn uống', null),
  makeCategory('c-coffee', 'Cà phê', 'c-food'),
  makeCategory('c-move', 'Di chuyển', null),
];

const baseAssets = [makeAsset('a-gold', 'Vàng SJC')];
const baseTags = [makeTag('t-1', 'ăn uống')];

function renderSheet(
  overrides: {
    value?: TransactionFilterValues;
    onApply?: (next: TransactionFilterValues) => void;
    onClose?: () => void;
    wallets?: WalletDetailView[];
    categories?: CategoryView[];
    assets?: AssetView[];
    tags?: TagView[];
    groups?: GroupFilterOption[];
  } = {},
) {
  const onApply = overrides.onApply ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  renderAt(
    <TransactionFilters
      open
      onClose={onClose}
      value={overrides.value ?? {}}
      onApply={onApply}
      wallets={overrides.wallets ?? baseWallets}
      categories={overrides.categories ?? baseCategories}
      assets={overrides.assets ?? baseAssets}
      tags={overrides.tags ?? baseTags}
      groups={overrides.groups}
    />,
  );
  return { onApply, onClose };
}

describe('TransactionFilters', () => {
  it('has no search or date fields in the sheet', () => {
    renderSheet();
    expect(screen.queryByTestId('tx-filter-search')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/From date/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/To date/i)).not.toBeInTheDocument();
  });

  it('tapping the wallet row opens its pick view and picking returns with the value shown', async () => {
    const user = userEvent.setup();
    renderSheet();

    const walletRow = screen.getByTestId('tx-filter-row-wallet');
    expect(walletRow).toHaveTextContent('All wallets');

    await user.click(walletRow);
    expect(screen.getByTestId('tx-filter-pick-back')).toBeInTheDocument();

    await user.click(screen.getByTestId('tx-filter-wallet-w-2'));
    expect(screen.queryByTestId('tx-filter-pick-back')).not.toBeInTheDocument();
    expect(screen.getByTestId('tx-filter-row-wallet')).toHaveTextContent('Vietcombank');
  });

  it('picking "All wallets" clears the wallet', async () => {
    const user = userEvent.setup();
    renderSheet({ value: { walletId: 'w-1' } });

    expect(screen.getByTestId('tx-filter-row-wallet')).toHaveTextContent('Tiền mặt');
    await user.click(screen.getByTestId('tx-filter-row-wallet'));
    await user.click(screen.getByTestId('tx-filter-wallet-all'));

    expect(screen.getByTestId('tx-filter-row-wallet')).toHaveTextContent('All wallets');
  });

  it('sub-categories are indented after their parent', async () => {
    const user = userEvent.setup();
    // Pass sub-category before parent to verify ordering places child after parent.
    const categories = [
      makeCategory('c-coffee', 'Cà phê', 'c-food'),
      makeCategory('c-move', 'Di chuyển', null),
      makeCategory('c-food', 'Ăn uống', null),
    ];
    renderSheet({ categories });

    await user.click(screen.getByTestId('tx-filter-row-category'));

    const buttons = screen
      .getAllByRole('button')
      .filter((el) => el.dataset.testid?.startsWith('tx-filter-category-'));
    const testIds = buttons.map((el) => el.dataset.testid);
    expect(testIds).toEqual([
      'tx-filter-category-all',
      'tx-filter-category-c-move',
      'tx-filter-category-c-food',
      'tx-filter-category-c-coffee',
    ]);

    const parent = screen.getByTestId('tx-filter-category-c-food');
    const child = screen.getByTestId('tx-filter-category-c-coffee');
    expect(parent).not.toHaveAttribute('data-indent');
    expect(child).toHaveAttribute('data-indent', '1');
  });

  it('a pick list of 9 shows a search that ignores accents', async () => {
    const user = userEvent.setup();
    const nineWallets = [
      makeWallet('w-1', 'Tiền mặt'),
      makeWallet('w-2', 'Vietcombank'),
      makeWallet('w-3', 'Techcombank'),
      makeWallet('w-4', 'Ví Đỏ'),
      makeWallet('w-5', 'Ngân hàng Á Châu'),
      makeWallet('w-6', 'Tiết kiệm'),
      makeWallet('w-7', 'Đầu tư'),
      makeWallet('w-8', 'Du lịch'),
      makeWallet('w-9', 'Cà phê quỹ'),
    ];
    renderSheet({ wallets: nineWallets });

    await user.click(screen.getByTestId('tx-filter-row-wallet'));
    const search = screen.getByTestId('tx-filter-pick-search');
    await user.type(search, 'ca phe');

    expect(screen.getByTestId('tx-filter-wallet-w-9')).toBeInTheDocument();
    expect(screen.queryByTestId('tx-filter-wallet-w-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tx-filter-wallet-w-2')).not.toBeInTheDocument();
  });

  it('back returns focus to the row', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByTestId('tx-filter-row-wallet'));
    const backBtn = screen.getByTestId('tx-filter-pick-back');
    expect(backBtn).toHaveFocus();

    await user.click(backBtn);
    expect(screen.getByTestId('tx-filter-row-wallet')).toHaveFocus();
  });

  it('apply passes q, from and to through unchanged', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClose = vi.fn();
    renderSheet({
      value: {
        q: 'bún bò',
        from: '2026-11-01',
        to: '2026-11-15',
      },
      onApply,
      onClose,
    });

    await user.click(screen.getByTestId('tx-filter-type-expense'));
    await user.click(screen.getByTestId('tx-filter-row-wallet'));
    await user.click(screen.getByTestId('tx-filter-wallet-w-1'));
    await user.click(screen.getByTestId('tx-filter-apply'));

    expect(onApply).toHaveBeenCalledWith({
      q: 'bún bò',
      from: '2026-11-01',
      to: '2026-11-15',
      type: 'expense',
      walletId: 'w-1',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('reset clears type, wallet, category, asset and tag in the draft', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    renderSheet({
      value: {
        q: 'cà phê',
        from: '2026-11-01',
        to: '2026-11-15',
        type: 'expense',
        walletId: 'w-1',
        categoryId: 'c-food',
        assetId: 'a-gold',
        tagId: 't-1',
      },
      onApply,
    });

    await user.click(screen.getByTestId('tx-filter-reset'));

    expect(screen.getByTestId('tx-filter-row-wallet')).toHaveTextContent('All wallets');
    expect(screen.getByTestId('tx-filter-row-category')).toHaveTextContent('All categories');
    expect(screen.getByTestId('tx-filter-row-asset')).toHaveTextContent('All assets');
    expect(screen.getByTestId('tx-filter-row-tag')).toHaveTextContent('All tags');

    await user.click(screen.getByTestId('tx-filter-apply'));
    expect(onApply).toHaveBeenCalledWith({
      q: 'cà phê',
      from: '2026-11-01',
      to: '2026-11-15',
    });
  });

  it('hides trade type chip when assets are empty and hides/clears group picker when groups=hide', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    renderSheet({
      assets: [],
      groups: [{ id: 'trip-1', name: 'Đà Lạt' }],
      value: { tripId: 'trip-1' },
      onApply,
    });

    expect(screen.queryByTestId('tx-filter-type-trade')).not.toBeInTheDocument();
    expect(screen.getByTestId('tx-filter-row-trip')).toBeInTheDocument();

    await user.click(screen.getByTestId('tx-filter-show-groups'));
    expect(screen.queryByTestId('tx-filter-row-trip')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('tx-filter-apply'));
    expect(onApply).toHaveBeenCalledWith({ groups: 'hide' });
  });
});
