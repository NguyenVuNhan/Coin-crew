import { describe, it, expect } from 'vitest';
import {
  INVESTMENT_VISIBLE_ROOT_KEYS,
  categoryRoot,
  categoryDefaultVisible,
  isCategoryVisibleIn,
  isAssetVisibleIn,
  inheritedAssetOverrides,
  type CategoryView,
  type AssetView,
  type VisibilityWallet,
  type WalletOverride,
} from '../src';

function cat(
  id: string,
  opts: {
    parentId?: string | null;
    type?: 'expense' | 'income';
    starterKey?: string | null;
    walletOverrides?: WalletOverride[];
  } = {},
): CategoryView {
  return {
    id,
    parentId: opts.parentId ?? null,
    type: opts.type ?? 'expense',
    name: id,
    icon: 'tag',
    hidden: false,
    sortOrder: 0,
    starterKey: opts.starterKey !== undefined ? opts.starterKey : null,
    walletOverrides: opts.walletOverrides ?? [],
  };
}

function asset(
  id: string,
  groupName: string,
  walletOverrides: WalletOverride[] = [],
): AssetView {
  return {
    id,
    name: id,
    unit: id,
    groupName,
    decimals: 8,
    hidden: false,
    sortOrder: 0,
    entryCount: 0,
    walletOverrides,
  };
}

describe('visibility', () => {
  const everyday: VisibilityWallet = { id: 'w-day', kind: 'everyday' };
  const investment: VisibilityWallet = { id: 'w-inv', kind: 'investment' };

  const food = cat('food', { starterKey: 'food' });
  const foodCafe = cat('food-cafe', { parentId: 'food', starterKey: 'food-cafe' });
  const invest = cat('invest', { starterKey: 'invest' });
  const investStock = cat('invest-stock', { parentId: 'invest', starterKey: 'invest-stock' });
  const fees = cat('fees', { starterKey: 'fees' });
  const tax = cat('tax', { parentId: 'fees', starterKey: 'tax' });
  const fee = cat('fee', { parentId: 'fees', starterKey: 'fee' });
  const u1 = cat('u1', { starterKey: null });
  const u1c = cat('u1c', { parentId: 'u1', starterKey: null });
  const salary = cat('salary', { type: 'income', starterKey: 'salary' });
  const otherIncome = cat('other-income', { type: 'income', starterKey: 'other-income' });
  const otherIncomeReward = cat('other-income-reward', {
    parentId: 'other-income',
    type: 'income',
    starterKey: 'other-income-reward',
  });

  const allCats = [
    food,
    foodCafe,
    invest,
    investStock,
    fees,
    tax,
    fee,
    u1,
    u1c,
    salary,
    otherIncome,
    otherIncomeReward,
  ];

  it('exports INVESTMENT_VISIBLE_ROOT_KEYS', () => {
    expect(INVESTMENT_VISIBLE_ROOT_KEYS).toEqual(['fees']);
  });

  it('categoryRoot walks parentId to root and stops on cycles', () => {
    expect(categoryRoot(tax, allCats)).toBe(fees);
    expect(categoryRoot(fees, allCats)).toBe(fees);

    const a = cat('a', { parentId: 'b' });
    const b = cat('b', { parentId: 'a' });
    expect(categoryRoot(a, [a, b]).id).toBe('b');
  });

  describe('categoryDefaultVisible', () => {
    it('everyday wallet is true for food, invest and user category u1', () => {
      expect(categoryDefaultVisible(food, allCats, 'everyday')).toBe(true);
      expect(categoryDefaultVisible(invest, allCats, 'everyday')).toBe(true);
      expect(categoryDefaultVisible(u1, allCats, 'everyday')).toBe(true);
    });

    it('investment wallet allows fees, tax, fee and all income; hides other expense categories', () => {
      expect(categoryDefaultVisible(fees, allCats, 'investment')).toBe(true);
      expect(categoryDefaultVisible(tax, allCats, 'investment')).toBe(true);
      expect(categoryDefaultVisible(fee, allCats, 'investment')).toBe(true);

      expect(categoryDefaultVisible(food, allCats, 'investment')).toBe(false);
      expect(categoryDefaultVisible(invest, allCats, 'investment')).toBe(false);
      expect(categoryDefaultVisible(investStock, allCats, 'investment')).toBe(false);
      expect(categoryDefaultVisible(u1, allCats, 'investment')).toBe(false);
      expect(categoryDefaultVisible(u1c, allCats, 'investment')).toBe(false);

      expect(categoryDefaultVisible(salary, allCats, 'investment')).toBe(true);
      expect(categoryDefaultVisible(otherIncomeReward, allCats, 'investment')).toBe(true);
    });
  });

  describe('isCategoryVisibleIn', () => {
    it('uses override when present for the wallet id, else default', () => {
      const foodHiddenOnDay = cat('food', {
        starterKey: 'food',
        walletOverrides: [{ walletId: 'w-day', visible: false }],
      });
      expect(isCategoryVisibleIn(foodHiddenOnDay, [foodHiddenOnDay], everyday)).toBe(false);
      expect(isCategoryVisibleIn(foodHiddenOnDay, [foodHiddenOnDay], investment)).toBe(false);

      const foodShownOnInv = cat('food', {
        starterKey: 'food',
        walletOverrides: [{ walletId: 'w-inv', visible: true }],
      });
      expect(isCategoryVisibleIn(foodShownOnInv, [foodShownOnInv], investment)).toBe(true);
    });

    it('does not cascade parent override to child at read time', () => {
      const foodShownOnInv = cat('food', {
        starterKey: 'food',
        walletOverrides: [{ walletId: 'w-inv', visible: true }],
      });
      const list = [foodShownOnInv, foodCafe];
      expect(isCategoryVisibleIn(foodShownOnInv, list, investment)).toBe(true);
      expect(isCategoryVisibleIn(foodCafe, list, investment)).toBe(false);
    });

    it('allows child override true when parent override is false', () => {
      const feesOff = cat('fees', {
        starterKey: 'fees',
        walletOverrides: [{ walletId: 'w-inv', visible: false }],
      });
      const taxOn = cat('tax', {
        parentId: 'fees',
        starterKey: 'tax',
        walletOverrides: [{ walletId: 'w-inv', visible: true }],
      });
      const list = [feesOff, taxOn];
      expect(isCategoryVisibleIn(feesOff, list, investment)).toBe(false);
      expect(isCategoryVisibleIn(taxOn, list, investment)).toBe(true);
    });
  });

  describe('isAssetVisibleIn', () => {
    it('is true with no override and false with {walletId: "w1", visible: false}', () => {
      const btc = asset('btc', 'Crypto');
      expect(isAssetVisibleIn(btc, 'w1')).toBe(true);

      const eth = asset('eth', 'Crypto', [{ walletId: 'w1', visible: false }]);
      expect(isAssetVisibleIn(eth, 'w1')).toBe(false);
      expect(isAssetVisibleIn(eth, 'w2')).toBe(true);
    });
  });

  describe('inheritedAssetOverrides', () => {
    const wallets: VisibilityWallet[] = [
      { id: 'w1', kind: 'investment' },
      { id: 'w2', kind: 'investment' },
    ];

    it('returns {walletId, visible: false} only for wallets where every asset in the group is hidden', () => {
      const assets = [
        asset('btc', 'Crypto', [
          { walletId: 'w1', visible: false },
          { walletId: 'w2', visible: false },
        ]),
        asset('eth', 'Crypto', [{ walletId: 'w1', visible: false }]),
        asset('vnm', 'ETF', [{ walletId: 'w2', visible: false }]),
      ];
      expect(inheritedAssetOverrides('Crypto', assets, wallets)).toEqual([
        { walletId: 'w1', visible: false },
      ]);
    });

    it('returns [] for an empty group', () => {
      const assets = [
        asset('vnm', 'ETF', [{ walletId: 'w1', visible: false }]),
      ];
      expect(inheritedAssetOverrides('Crypto', assets, wallets)).toEqual([]);
    });

    it('ignores assets of other groups', () => {
      const assets = [
        asset('btc', 'Crypto', []),
        asset('vnm', 'ETF', [
          { walletId: 'w1', visible: false },
          { walletId: 'w2', visible: false },
        ]),
      ];
      expect(inheritedAssetOverrides('Crypto', assets, wallets)).toEqual([]);
    });
  });
});
