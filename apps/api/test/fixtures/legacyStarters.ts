export interface StarterCategory {
  key: string;
  parentKey: string | null;
  type: 'expense' | 'income';
  name: string;
  icon: string;
  sortOrder: number;
}

/**
 * Test fixture: the starter categories seeded before the fixed danh mục list (issue 140).
 * Existing users still have these rows; `seedLegacyStarters` recreates them.
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
  { key: 'fees', parentKey: null, type: 'expense', name: 'Phí & lệ phí', icon: 'receipt-text', sortOrder: 6 },

  // Expense (Phí & lệ phí sub-categories)
  { key: 'tax', parentKey: 'fees', type: 'expense', name: 'Thuế', icon: 'landmark', sortOrder: 0 },
  { key: 'fee', parentKey: 'fees', type: 'expense', name: 'Phí', icon: 'badge-percent', sortOrder: 1 },

  // Income (top-level)
  { key: 'salary', parentKey: null, type: 'income', name: 'Lương', icon: 'wallet', sortOrder: 0 },
  { key: 'interest', parentKey: null, type: 'income', name: 'Lãi', icon: 'piggy-bank', sortOrder: 1 },
  { key: 'dividend', parentKey: null, type: 'income', name: 'Cổ tức', icon: 'coins', sortOrder: 2 },
  { key: 'other-income', parentKey: null, type: 'income', name: 'Thu nhập khác', icon: 'gift', sortOrder: 3 },

  // Income (Thu nhập khác sub-categories)
  { key: 'other-income-reward', parentKey: 'other-income', type: 'income', name: 'Thưởng / Staking', icon: 'gift', sortOrder: 0 },
];
