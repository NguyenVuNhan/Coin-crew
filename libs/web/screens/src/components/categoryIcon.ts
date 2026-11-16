import type { IconName } from '@cc/web-ui/components/icons';

const KNOWN_ICON_MAP: Record<string, IconName> = {
  utensils: 'utensils',
  bus: 'bus',
  'shopping-bag': 'shopping-bag',
  receipt: 'receipt',
  'heart-pulse': 'heart-pulse',
  'trending-up': 'trending-up',
  landmark: 'landmark',
  'badge-percent': 'badge-percent',
  'candlestick-chart': 'candlestick-chart',
  coins: 'coins',
  'pie-chart': 'pie-chart',
  gem: 'gem',
  wallet: 'wallet',
  'piggy-bank': 'piggy-bank',
  gift: 'gift',
  home: 'home',
  bank: 'bank',
  pie: 'pie',
  piggyBank: 'piggyBank',
  users: 'users',
  user: 'user',
  calendar: 'calendar',
  clock: 'clock',
  star: 'star',
  crown: 'crown',
  trophy: 'trophy',
  shield: 'shield',
  swap: 'swap',
  camera: 'camera',
  smartphone: 'smartphone',
  settings: 'settings',
  map: 'map',
  suitcase: 'suitcase',
  bell: 'bell',
  palette: 'palette',
};

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
