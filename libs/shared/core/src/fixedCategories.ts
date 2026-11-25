export interface FixedCategory {
  key: string;
  parentKey: string | null;
  type: 'expense' | 'income';
  name: string;
  icon: string;
  sortOrder: number;
}

export const GENERAL_CATEGORY_KEY = 'general';

type RawFixedCategory = Omit<FixedCategory, 'sortOrder'>;

const RAW_FIXED_CATEGORIES: readonly RawFixedCategory[] = [
  // Expense groups & sub-categories
  { key: 'food', parentKey: null, type: 'expense', name: 'Ăn uống', icon: 'utensils' },
  { key: 'food-dining', parentKey: 'food', type: 'expense', name: 'Ăn ngoài', icon: 'utensils-crossed' },
  { key: 'food-groceries', parentKey: 'food', type: 'expense', name: 'Đi chợ / siêu thị', icon: 'shopping-basket' },
  { key: 'food-liquor', parentKey: 'food', type: 'expense', name: 'Bia rượu', icon: 'beer' },

  { key: 'transport', parentKey: null, type: 'expense', name: 'Di chuyển', icon: 'car' },
  { key: 'transport-bicycle', parentKey: 'transport', type: 'expense', name: 'Xe đạp', icon: 'bike' },
  { key: 'transport-bus-train', parentKey: 'transport', type: 'expense', name: 'Xe buýt / tàu', icon: 'bus' },
  { key: 'transport-car', parentKey: 'transport', type: 'expense', name: 'Ô tô', icon: 'car' },
  { key: 'transport-fuel', parentKey: 'transport', type: 'expense', name: 'Xăng xe', icon: 'fuel' },
  { key: 'transport-hotel', parentKey: 'transport', type: 'expense', name: 'Khách sạn', icon: 'hotel' },
  { key: 'transport-parking', parentKey: 'transport', type: 'expense', name: 'Gửi xe', icon: 'square-parking' },
  { key: 'transport-plane', parentKey: 'transport', type: 'expense', name: 'Máy bay', icon: 'plane' },
  { key: 'transport-taxi', parentKey: 'transport', type: 'expense', name: 'Taxi / Grab', icon: 'car-taxi-front' },

  { key: 'entertainment', parentKey: null, type: 'expense', name: 'Giải trí', icon: 'party-popper' },
  { key: 'entertainment-games', parentKey: 'entertainment', type: 'expense', name: 'Trò chơi', icon: 'gamepad-2' },
  { key: 'entertainment-movies', parentKey: 'entertainment', type: 'expense', name: 'Xem phim', icon: 'film' },
  { key: 'entertainment-music', parentKey: 'entertainment', type: 'expense', name: 'Âm nhạc', icon: 'music' },
  { key: 'entertainment-sports', parentKey: 'entertainment', type: 'expense', name: 'Thể thao', icon: 'dumbbell' },

  { key: 'home', parentKey: null, type: 'expense', name: 'Nhà cửa', icon: 'house' },
  { key: 'home-electronics', parentKey: 'home', type: 'expense', name: 'Đồ điện tử', icon: 'tv' },
  { key: 'home-furniture', parentKey: 'home', type: 'expense', name: 'Nội thất', icon: 'sofa' },
  { key: 'home-supplies', parentKey: 'home', type: 'expense', name: 'Đồ gia dụng', icon: 'package' },
  { key: 'home-maintenance', parentKey: 'home', type: 'expense', name: 'Sửa chữa', icon: 'wrench' },
  { key: 'home-mortgage', parentKey: 'home', type: 'expense', name: 'Trả góp nhà', icon: 'landmark' },
  { key: 'home-pets', parentKey: 'home', type: 'expense', name: 'Thú cưng', icon: 'paw-print' },
  { key: 'home-rent', parentKey: 'home', type: 'expense', name: 'Tiền nhà', icon: 'key-round' },
  { key: 'home-services', parentKey: 'home', type: 'expense', name: 'Dịch vụ', icon: 'concierge-bell' },

  { key: 'life', parentKey: null, type: 'expense', name: 'Cuộc sống', icon: 'heart-handshake' },
  { key: 'life-childcare', parentKey: 'life', type: 'expense', name: 'Con cái', icon: 'baby' },
  { key: 'life-clothing', parentKey: 'life', type: 'expense', name: 'Quần áo', icon: 'shirt' },
  { key: 'life-education', parentKey: 'life', type: 'expense', name: 'Học tập', icon: 'graduation-cap' },
  { key: 'life-gifts', parentKey: 'life', type: 'expense', name: 'Quà tặng', icon: 'gift' },
  { key: 'life-insurance', parentKey: 'life', type: 'expense', name: 'Bảo hiểm', icon: 'shield' },
  { key: 'life-medical', parentKey: 'life', type: 'expense', name: 'Khám chữa bệnh', icon: 'stethoscope' },
  { key: 'life-taxes', parentKey: 'life', type: 'expense', name: 'Thuế', icon: 'scale' },

  { key: 'bills', parentKey: null, type: 'expense', name: 'Hóa đơn', icon: 'receipt' },
  { key: 'bills-cleaning', parentKey: 'bills', type: 'expense', name: 'Dọn dẹp', icon: 'spray-can' },
  { key: 'bills-electricity', parentKey: 'bills', type: 'expense', name: 'Điện', icon: 'zap' },
  { key: 'bills-gas', parentKey: 'bills', type: 'expense', name: 'Gas', icon: 'flame' },
  { key: 'bills-trash', parentKey: 'bills', type: 'expense', name: 'Rác', icon: 'trash-2' },
  { key: 'bills-internet', parentKey: 'bills', type: 'expense', name: 'Mạng / ĐT / TV', icon: 'wifi' },
  { key: 'bills-water', parentKey: 'bills', type: 'expense', name: 'Nước', icon: 'droplet' },

  // Childless expense entries
  { key: 'general', parentKey: null, type: 'expense', name: 'Chung', icon: 'tag' },
  { key: 'lend', parentKey: null, type: 'expense', name: 'Cho vay', icon: 'hand-coins' },

  // Income entries
  { key: 'borrow', parentKey: null, type: 'income', name: 'Đi vay', icon: 'handshake' },
  { key: 'salary', parentKey: null, type: 'income', name: 'Lương', icon: 'wallet' },
  { key: 'bonus', parentKey: null, type: 'income', name: 'Thưởng', icon: 'trophy' },
  { key: 'interest', parentKey: null, type: 'income', name: 'Lãi', icon: 'piggy-bank' },
  { key: 'other-income', parentKey: null, type: 'income', name: 'Thu nhập khác', icon: 'coins' },
];

function assignSiblingSortOrder(entries: readonly RawFixedCategory[]): FixedCategory[] {
  const counts = new Map<string, number>();
  return entries.map((entry) => {
    const scope = entry.parentKey ?? `root:${entry.type}`;
    const sortOrder = counts.get(scope) ?? 0;
    counts.set(scope, sortOrder + 1);
    return { ...entry, sortOrder };
  });
}

export const FIXED_CATEGORIES: readonly FixedCategory[] = assignSiblingSortOrder(RAW_FIXED_CATEGORIES);

const BY_KEY = new Map<string, FixedCategory>(FIXED_CATEGORIES.map((c) => [c.key, c]));

export const FIXED_CATEGORY_KEYS: ReadonlySet<string> = new Set(BY_KEY.keys());

export function fixedCategory(key: string): FixedCategory | undefined {
  return BY_KEY.get(key);
}

export function isFixedExpenseKey(key: string): boolean {
  return BY_KEY.get(key)?.type === 'expense';
}

/** Old starter keys whose row is adopted as the fixed entry with the same key. */
export const ADOPTED_STARTER_KEYS: ReadonlySet<string> = new Set([
  'food',
  'transport',
  'bills',
  'lend',
  'borrow',
  'salary',
  'interest',
  'other-income',
]);
