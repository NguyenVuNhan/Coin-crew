import type { IconName } from '@cc/web-ui/components/icons';

export interface CategoryIconOption {
  name: IconName;
  keywords: readonly string[];
}

/** Curated category icons with English and Vietnamese search keywords. */
export const CATEGORY_ICON_OPTIONS: readonly CategoryIconOption[] = [
  { name: 'receipt', keywords: ['hóa đơn', 'chi tiêu', 'bill', 'expense'] },
  { name: 'utensils', keywords: ['ăn uống', 'nhà hàng', 'cơm', 'quán ăn', 'food', 'eat'] },
  { name: 'coffee', keywords: ['cà phê', 'trà sữa', 'nước uống', 'drink', 'cafe'] },
  { name: 'bus', keywords: ['xe buýt', 'di chuyển', 'giao thông', 'đi lại', 'transport'] },
  { name: 'car', keywords: ['ô tô', 'xe hơi', 'taxi', 'grab', 'car'] },
  { name: 'fuel', keywords: ['xăng', 'dầu', 'đổ xăng', 'gas', 'fuel'] },
  { name: 'plane', keywords: ['máy bay', 'du lịch', 'vé', 'flight', 'travel'] },
  { name: 'suitcase', keywords: ['vali', 'hành lý', 'công tác', 'du lịch', 'luggage'] },
  { name: 'map', keywords: ['bản đồ', 'chuyến đi', 'du lịch', 'map', 'trip'] },
  { name: 'shopping-bag', keywords: ['mua sắm', 'siêu thị', 'chợ', 'shopping'] },
  { name: 'shirt', keywords: ['quần áo', 'thời trang', 'giày dép', 'clothes'] },
  { name: 'home', keywords: ['nhà cửa', 'tiền nhà', 'thuê nhà', 'gia đình', 'house'] },
  { name: 'zap', keywords: ['tiền điện', 'điện', 'hóa đơn', 'electricity'] },
  { name: 'wifi', keywords: ['mạng', 'internet', 'cước', 'viễn thông', 'wifi'] },
  { name: 'smartphone', keywords: ['điện thoại', 'nạp thẻ', 'di động', 'phone'] },
  { name: 'laptop', keywords: ['máy tính', 'công nghệ', 'làm việc', 'tech'] },
  { name: 'heart-pulse', keywords: ['sức khỏe', 'y tế', 'bảo hiểm', 'health'] },
  { name: 'stethoscope', keywords: ['bác sĩ', 'khám bệnh', 'thuốc', 'bệnh viện', 'doctor'] },
  { name: 'dumbbell', keywords: ['thể thao', 'gym', 'tập luyện', 'sport'] },
  { name: 'graduation-cap', keywords: ['học tập', 'giáo dục', 'học phí', 'education'] },
  { name: 'book-open', keywords: ['sách', 'đọc sách', 'tài liệu', 'book'] },
  { name: 'gamepad-2', keywords: ['trò chơi', 'game', 'giải trí', 'entertainment'] },
  { name: 'film', keywords: ['xem phim', 'rạp', 'giải trí', 'movie'] },
  { name: 'music', keywords: ['âm nhạc', 'ca nhạc', 'giải trí', 'music'] },
  { name: 'palette', keywords: ['nghệ thuật', 'vẽ', 'sở thích', 'art', 'hobby'] },
  { name: 'camera', keywords: ['chụp ảnh', 'máy ảnh', 'ảnh', 'photo'] },
  { name: 'gift', keywords: ['quà tặng', 'sinh nhật', 'hiếu hỉ', 'gift'] },
  { name: 'users', keywords: ['gia đình', 'bạn bè', 'nhóm', 'family', 'friends'] },
  { name: 'wallet', keywords: ['ví', 'tiền mặt', 'thu nhập', 'lương', 'wallet', 'income'] },
  { name: 'briefcase', keywords: ['công việc', 'lương', 'văn phòng', 'work', 'salary'] },
  { name: 'coins', keywords: ['tiền xu', 'thu nhập', 'tiền lẻ', 'money'] },
  { name: 'piggy-bank', keywords: ['tiết kiệm', 'bỏ heo', 'tích lũy', 'saving'] },
  { name: 'landmark', keywords: ['ngân hàng', 'chuyển khoản', 'thuế', 'bank'] },
  { name: 'trending-up', keywords: ['đầu tư', 'lãi', 'tăng trưởng', 'invest'] },
  { name: 'candlestick-chart', keywords: ['chứng khoán', 'cổ phiếu', 'crypto', 'trading'] },
  { name: 'pie-chart', keywords: ['báo cáo', 'phân bổ', 'tài chính', 'chart'] },
  { name: 'badge-percent', keywords: ['khuyến mãi', 'giảm giá', 'hoàn tiền', 'discount'] },
  { name: 'gem', keywords: ['trang sức', 'xa xỉ', 'vàng', 'jewelry'] },
  { name: 'crown', keywords: ['cao cấp', 'vip', 'thành viên', 'premium'] },
  { name: 'trophy', keywords: ['thưởng', 'giải thưởng', 'thành tích', 'award'] },
  { name: 'star', keywords: ['yêu thích', 'đặc biệt', 'khác', 'star'] },
  { name: 'shield', keywords: ['bảo hiểm', 'an toàn', 'bảo vệ', 'insurance'] },
  { name: 'wrench', keywords: ['sửa chữa', 'bảo trì', 'xe cộ', 'repair'] },
];

const KNOWN_ICON_MAP: Record<string, IconName> = {
  ...Object.fromEntries(CATEGORY_ICON_OPTIONS.map((o) => [o.name, o.name])),
  bank: 'bank',
  pie: 'pie',
  piggyBank: 'piggyBank',
  user: 'user',
  calendar: 'calendar',
  clock: 'clock',
  swap: 'swap',
  settings: 'settings',
  bell: 'bell',
};

function foldVietnamese(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Filter curated category icons by icon name or Vietnamese/English keywords. */
export function filterCategoryIcons(query: string): IconName[] {
  const q = foldVietnamese(query.trim());
  if (!q) return CATEGORY_ICON_OPTIONS.map((o) => o.name);
  return CATEGORY_ICON_OPTIONS.filter(
    (opt) =>
      foldVietnamese(opt.name).includes(q) ||
      opt.keywords.some((kw) => foldVietnamese(kw).includes(q)),
  ).map((o) => o.name);
}

/** Resolve a stored category icon name to a valid `@cc/web-ui` IconName. */
export function categoryIconName(
  name: string | undefined,
  fallbackType: 'expense' | 'income' = 'expense',
): IconName {
  if (name && KNOWN_ICON_MAP[name]) {
    return KNOWN_ICON_MAP[name];
  }
  return fallbackType === 'income' ? 'wallet' : 'receipt';
}
