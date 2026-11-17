export interface StarterCategory {
  key: string;
  parentKey: string | null;
  type: 'expense' | 'income';
  name: string;
  icon: string;
  sortOrder: number;
}

/**
 * Starter categories seeded lazily on a user's first GET /me/personal/categories.
 * Parents appear before their sub-categories so batch inserts satisfy the self-FK.
 */
export const STARTER_CATEGORIES: readonly StarterCategory[] = [
  // Expense (top-level)
  { key: 'food', parentKey: null, type: 'expense', name: 'Ăn uống', icon: 'utensils', sortOrder: 0 },
  { key: 'transport', parentKey: null, type: 'expense', name: 'Di chuyển', icon: 'bus', sortOrder: 1 },
  { key: 'shopping', parentKey: null, type: 'expense', name: 'Mua sắm', icon: 'shopping-bag', sortOrder: 2 },
  { key: 'bills', parentKey: null, type: 'expense', name: 'Hóa đơn', icon: 'receipt', sortOrder: 3 },
  { key: 'health', parentKey: null, type: 'expense', name: 'Sức khỏe', icon: 'heart-pulse', sortOrder: 4 },
  { key: 'invest', parentKey: null, type: 'expense', name: 'Đầu tư', icon: 'trending-up', sortOrder: 5 },
  { key: 'tax', parentKey: null, type: 'expense', name: 'Thuế', icon: 'landmark', sortOrder: 6 },
  { key: 'fee', parentKey: null, type: 'expense', name: 'Phí', icon: 'badge-percent', sortOrder: 7 },

  // Expense (Đầu tư sub-categories)
  { key: 'invest-stock', parentKey: 'invest', type: 'expense', name: 'Cổ phiếu', icon: 'candlestick-chart', sortOrder: 0 },
  { key: 'invest-crypto', parentKey: 'invest', type: 'expense', name: 'Crypto', icon: 'coins', sortOrder: 1 },
  { key: 'invest-etf', parentKey: 'invest', type: 'expense', name: 'ETF', icon: 'pie-chart', sortOrder: 2 },
  { key: 'invest-gold', parentKey: 'invest', type: 'expense', name: 'Vàng', icon: 'gem', sortOrder: 3 },

  // Income (top-level)
  { key: 'salary', parentKey: null, type: 'income', name: 'Lương', icon: 'wallet', sortOrder: 0 },
  { key: 'interest', parentKey: null, type: 'income', name: 'Lãi', icon: 'piggy-bank', sortOrder: 1 },
  { key: 'dividend', parentKey: null, type: 'income', name: 'Cổ tức', icon: 'coins', sortOrder: 2 },
  { key: 'other-income', parentKey: null, type: 'income', name: 'Thu nhập khác', icon: 'gift', sortOrder: 3 },
];
