import { foldForSearch } from './listFilter';

export interface CurrencyInfo {
  decimals: 0 | 2;
  symbol: string;
  max: number;
  nameVi: string;
  nameEn: string;
  badge: string;
  kind: 'fiat' | 'crypto';
  popular?: boolean;
}

export const CURRENCY_CODES = [
  'VND', 'USD', 'USDT', 'USDC', 'EUR', 'JPY', 'GBP', 'SGD', 'AUD', 'KRW', 'CNY', 'THB',
  'TWD', 'HKD', 'MYR', 'IDR', 'PHP', 'INR', 'NZD', 'KHR', 'LAK', 'MMK', 'BND', 'MOP', 'PKR', 'BDT', 'LKR', 'NPR',
  'CAD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'ISK', 'RUB', 'UAH', 'TRY', 'BRL', 'MXN', 'ARS', 'CLP', 'COP',
  'AED', 'SAR', 'QAR', 'ILS', 'ZAR', 'EGP', 'NGN', 'DAI', 'EURC',
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  // Popular / Pinned (12)
  VND: { decimals: 0, symbol: '₫', max: 1_000_000_000_000, nameVi: 'Việt Nam Đồng', nameEn: 'Vietnamese Dong', badge: '₫', kind: 'fiat', popular: true },
  USD: { decimals: 2, symbol: '$', max: 10_000_000_000, nameVi: 'Đô la Mỹ', nameEn: 'US Dollar', badge: '$', kind: 'fiat', popular: true },
  USDT: { decimals: 2, symbol: 'USDT', max: 10_000_000_000, nameVi: 'Tether USD', nameEn: 'Tether', badge: '₮', kind: 'crypto', popular: true },
  USDC: { decimals: 2, symbol: 'USDC', max: 10_000_000_000, nameVi: 'USD Coin', nameEn: 'USD Coin', badge: '$C', kind: 'crypto', popular: true },
  EUR: { decimals: 2, symbol: '€', max: 10_000_000_000, nameVi: 'Euro', nameEn: 'Euro', badge: '€', kind: 'fiat', popular: true },
  JPY: { decimals: 0, symbol: '¥', max: 100_000_000_000, nameVi: 'Yên Nhật', nameEn: 'Japanese Yen', badge: '¥', kind: 'fiat', popular: true },
  GBP: { decimals: 2, symbol: '£', max: 10_000_000_000, nameVi: 'Bảng Anh', nameEn: 'British Pound', badge: '£', kind: 'fiat', popular: true },
  SGD: { decimals: 2, symbol: 'S$', max: 10_000_000_000, nameVi: 'Đô la Singapore', nameEn: 'Singapore Dollar', badge: 'S$', kind: 'fiat', popular: true },
  AUD: { decimals: 2, symbol: 'A$', max: 10_000_000_000, nameVi: 'Đô la Úc', nameEn: 'Australian Dollar', badge: 'A$', kind: 'fiat', popular: true },
  KRW: { decimals: 0, symbol: '₩', max: 100_000_000_000, nameVi: 'Won Hàn Quốc', nameEn: 'South Korean Won', badge: '₩', kind: 'fiat', popular: true },
  CNY: { decimals: 2, symbol: '¥', max: 10_000_000_000, nameVi: 'Nhân dân tệ', nameEn: 'Chinese Yuan', badge: '¥', kind: 'fiat', popular: true },
  THB: { decimals: 2, symbol: '฿', max: 10_000_000_000, nameVi: 'Baht Thái', nameEn: 'Thai Baht', badge: '฿', kind: 'fiat', popular: true },

  // Asia-Pacific (16)
  TWD: { decimals: 0, symbol: 'NT$', max: 10_000_000_000, nameVi: 'Đô la Đài Loan', nameEn: 'New Taiwan Dollar', badge: 'NT$', kind: 'fiat' },
  HKD: { decimals: 2, symbol: 'HK$', max: 10_000_000_000, nameVi: 'Đô la Hồng Kông', nameEn: 'Hong Kong Dollar', badge: 'HK$', kind: 'fiat' },
  MYR: { decimals: 2, symbol: 'RM', max: 10_000_000_000, nameVi: 'Ringgit Malaysia', nameEn: 'Malaysian Ringgit', badge: 'RM', kind: 'fiat' },
  IDR: { decimals: 0, symbol: 'Rp', max: 1_000_000_000_000, nameVi: 'Rupiah Indonesia', nameEn: 'Indonesian Rupiah', badge: 'Rp', kind: 'fiat' },
  PHP: { decimals: 2, symbol: '₱', max: 10_000_000_000, nameVi: 'Peso Philippines', nameEn: 'Philippine Peso', badge: '₱', kind: 'fiat' },
  INR: { decimals: 2, symbol: '₹', max: 100_000_000_000, nameVi: 'Rupee Ấn Độ', nameEn: 'Indian Rupee', badge: '₹', kind: 'fiat' },
  NZD: { decimals: 2, symbol: 'NZ$', max: 10_000_000_000, nameVi: 'Đô la New Zealand', nameEn: 'New Zealand Dollar', badge: 'NZ$', kind: 'fiat' },
  KHR: { decimals: 0, symbol: '៛', max: 1_000_000_000_000, nameVi: 'Riel Campuchia', nameEn: 'Cambodian Riel', badge: '៛', kind: 'fiat' },
  LAK: { decimals: 0, symbol: '₭', max: 1_000_000_000_000, nameVi: 'Kip Lào', nameEn: 'Lao Kip', badge: '₭', kind: 'fiat' },
  MMK: { decimals: 0, symbol: 'K', max: 1_000_000_000_000, nameVi: 'Kyat Myanmar', nameEn: 'Myanmar Kyat', badge: 'K', kind: 'fiat' },
  BND: { decimals: 2, symbol: 'B$', max: 10_000_000_000, nameVi: 'Đô la Brunei', nameEn: 'Brunei Dollar', badge: 'B$', kind: 'fiat' },
  MOP: { decimals: 2, symbol: 'MOP$', max: 10_000_000_000, nameVi: 'Pataca Ma Cao', nameEn: 'Macanese Pataca', badge: 'P', kind: 'fiat' },
  PKR: { decimals: 2, symbol: '₨', max: 100_000_000_000, nameVi: 'Rupee Pakistan', nameEn: 'Pakistani Rupee', badge: '₨', kind: 'fiat' },
  BDT: { decimals: 2, symbol: '৳', max: 100_000_000_000, nameVi: 'Taka Bangladesh', nameEn: 'Bangladeshi Taka', badge: '৳', kind: 'fiat' },
  LKR: { decimals: 2, symbol: 'Rs', max: 100_000_000_000, nameVi: 'Rupee Sri Lanka', nameEn: 'Sri Lankan Rupee', badge: 'Rs', kind: 'fiat' },
  NPR: { decimals: 2, symbol: '₨', max: 100_000_000_000, nameVi: 'Rupee Nepal', nameEn: 'Nepalese Rupee', badge: '₨', kind: 'fiat' },

  // Americas & Europe (18)
  CAD: { decimals: 2, symbol: 'CA$', max: 10_000_000_000, nameVi: 'Đô la Canada', nameEn: 'Canadian Dollar', badge: 'C$', kind: 'fiat' },
  CHF: { decimals: 2, symbol: 'CHF', max: 10_000_000_000, nameVi: 'Franc Thụy Sĩ', nameEn: 'Swiss Franc', badge: 'Fr', kind: 'fiat' },
  SEK: { decimals: 2, symbol: 'kr', max: 10_000_000_000, nameVi: 'Krona Thụy Điển', nameEn: 'Swedish Krona', badge: 'kr', kind: 'fiat' },
  NOK: { decimals: 2, symbol: 'kr', max: 10_000_000_000, nameVi: 'Krone Na Uy', nameEn: 'Norwegian Krone', badge: 'kr', kind: 'fiat' },
  DKK: { decimals: 2, symbol: 'kr', max: 10_000_000_000, nameVi: 'Krone Đan Mạch', nameEn: 'Danish Krone', badge: 'kr', kind: 'fiat' },
  PLN: { decimals: 2, symbol: 'zł', max: 10_000_000_000, nameVi: 'Zloty Ba Lan', nameEn: 'Polish Zloty', badge: 'zł', kind: 'fiat' },
  CZK: { decimals: 2, symbol: 'Kč', max: 10_000_000_000, nameVi: 'Koruna Séc', nameEn: 'Czech Koruna', badge: 'Kč', kind: 'fiat' },
  HUF: { decimals: 0, symbol: 'Ft', max: 100_000_000_000, nameVi: 'Forint Hungary', nameEn: 'Hungarian Forint', badge: 'Ft', kind: 'fiat' },
  RON: { decimals: 2, symbol: 'lei', max: 10_000_000_000, nameVi: 'Leu Romania', nameEn: 'Romanian Leu', badge: 'lei', kind: 'fiat' },
  ISK: { decimals: 0, symbol: 'kr', max: 100_000_000_000, nameVi: 'Króna Iceland', nameEn: 'Icelandic Króna', badge: 'kr', kind: 'fiat' },
  RUB: { decimals: 2, symbol: '₽', max: 100_000_000_000, nameVi: 'Rúp Nga', nameEn: 'Russian Ruble', badge: '₽', kind: 'fiat' },
  UAH: { decimals: 2, symbol: '₴', max: 10_000_000_000, nameVi: 'Hryvnia Ukraine', nameEn: 'Ukrainian Hryvnia', badge: '₴', kind: 'fiat' },
  TRY: { decimals: 2, symbol: '₺', max: 10_000_000_000, nameVi: 'Lira Thổ Nhĩ Kỳ', nameEn: 'Turkish Lira', badge: '₺', kind: 'fiat' },
  BRL: { decimals: 2, symbol: 'R$', max: 10_000_000_000, nameVi: 'Real Brazil', nameEn: 'Brazilian Real', badge: 'R$', kind: 'fiat' },
  MXN: { decimals: 2, symbol: 'MX$', max: 10_000_000_000, nameVi: 'Peso Mexico', nameEn: 'Mexican Peso', badge: 'M$', kind: 'fiat' },
  ARS: { decimals: 2, symbol: 'AR$', max: 100_000_000_000, nameVi: 'Peso Argentina', nameEn: 'Argentine Peso', badge: 'A$', kind: 'fiat' },
  CLP: { decimals: 0, symbol: 'CLP$', max: 100_000_000_000, nameVi: 'Peso Chile', nameEn: 'Chilean Peso', badge: 'CL$', kind: 'fiat' },
  COP: { decimals: 0, symbol: 'COL$', max: 1_000_000_000_000, nameVi: 'Peso Colombia', nameEn: 'Colombian Peso', badge: 'CO$', kind: 'fiat' },

  // Middle East, Africa & Additional Stablecoins (9)
  AED: { decimals: 2, symbol: 'AED', max: 10_000_000_000, nameVi: 'Dirham UAE', nameEn: 'UAE Dirham', badge: 'د.إ', kind: 'fiat' },
  SAR: { decimals: 2, symbol: 'SAR', max: 10_000_000_000, nameVi: 'Riyal Ả Rập Xê Út', nameEn: 'Saudi Riyal', badge: '﷼', kind: 'fiat' },
  QAR: { decimals: 2, symbol: 'QAR', max: 10_000_000_000, nameVi: 'Riyal Qatar', nameEn: 'Qatari Riyal', badge: 'QR', kind: 'fiat' },
  ILS: { decimals: 2, symbol: '₪', max: 10_000_000_000, nameVi: 'Shekel Israel', nameEn: 'Israeli New Shekel', badge: '₪', kind: 'fiat' },
  ZAR: { decimals: 2, symbol: 'R', max: 10_000_000_000, nameVi: 'Rand Nam Phi', nameEn: 'South African Rand', badge: 'R', kind: 'fiat' },
  EGP: { decimals: 2, symbol: 'E£', max: 10_000_000_000, nameVi: 'Bảng Ai Cập', nameEn: 'Egyptian Pound', badge: 'E£', kind: 'fiat' },
  NGN: { decimals: 2, symbol: '₦', max: 100_000_000_000, nameVi: 'Naira Nigeria', nameEn: 'Nigerian Naira', badge: '₦', kind: 'fiat' },
  DAI: { decimals: 2, symbol: 'DAI', max: 10_000_000_000, nameVi: 'Dai', nameEn: 'Dai', badge: '◈', kind: 'crypto' },
  EURC: { decimals: 2, symbol: 'EURC', max: 10_000_000_000, nameVi: 'Euro Coin', nameEn: 'Euro Coin', badge: '€C', kind: 'crypto' },
};

export function isCurrencyCode(x: unknown): x is CurrencyCode {
  return typeof x === 'string' && (CURRENCY_CODES as readonly string[]).includes(x);
}

/**
 * Filter the currency catalog by matching code, symbol, badge, or accent-folded
 * Vietnamese/English name against the query.
 */
export function searchCurrencies(query: string): CurrencyCode[] {
  const q = foldForSearch(query.trim());
  if (q === '') return [...CURRENCY_CODES];
  return CURRENCY_CODES.filter((code) => {
    const info = CURRENCIES[code];
    return (
      foldForSearch(code).includes(q) ||
      foldForSearch(info.symbol).includes(q) ||
      foldForSearch(info.badge).includes(q) ||
      foldForSearch(info.nameVi).includes(q) ||
      foldForSearch(info.nameEn).includes(q)
    );
  });
}

export function isValidAmount(
  minor: unknown,
  code: CurrencyCode,
  opts?: { allowNegative?: boolean; allowZero?: boolean },
): minor is number {
  if (typeof minor !== 'number' || !Number.isSafeInteger(minor)) return false;
  if (!opts?.allowZero && minor === 0) return false;
  if (!opts?.allowNegative && minor < 0) return false;
  return Math.abs(minor) <= CURRENCIES[code].max;
}

export function formatMoney(minor: number, code: CurrencyCode): string {
  const info = CURRENCIES[code];
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));

  if (info.decimals === 0) {
    const whole = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const sep = info.symbol.length === 1 ? '' : ' ';
    return `${sign}${whole}${sep}${info.symbol}`;
  }

  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole},${frac} ${info.symbol}`;
}

const SUFFIX_ZEROS = { k: 3, tr: 6 } as const;

function parseIntegerAmount(input: string, max: number, allowSuffixes: boolean): number | null {
  const s = input.trim().toLowerCase();
  let value: number | null = null;

  const suffixed = allowSuffixes ? /^(\d+)(?:[.,](\d+))?\s*(k|tr)$/.exec(s) : null;
  if (suffixed) {
    const [, whole = '', frac = '', unit] = suffixed;
    const zeros = SUFFIX_ZEROS[unit as keyof typeof SUFFIX_ZEROS];
    if (frac.length === 3) {
      value = Number(whole + frac) * 10 ** zeros;
    } else {
      if (frac.length > zeros) return null;
      value = Number(whole) * 10 ** zeros + Number(frac.padEnd(zeros, '0') || '0');
    }
  } else if (/^\d+$/.test(s) || /^\d{1,3}([., ])\d{3}(?:\1\d{3})*$/.test(s)) {
    value = Number(s.replace(/[., ]/g, ''));
  }

  if (value === null || !Number.isSafeInteger(value) || value <= 0 || value > max) return null;
  return value;
}

function parseDecimalAmount(input: string, max: number): number | null {
  const s = input.trim();
  let wholeStr: string | null = null;
  let fracStr = '';

  const simple = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (simple) {
    wholeStr = simple[1] ?? null;
    fracStr = simple[2] ?? '';
  } else {
    // Either 2+ dot-separated thousands groups (optional comma decimals) or 1 dot group with comma decimals.
    // A single dot group with 3 digits and no comma (e.g. "1.234") is ambiguous and rejected.
    const grouped = /^(\d{1,3}(?:\.\d{3}){2,})(?:,(\d{1,2}))?$/.exec(s) ?? /^(\d{1,3}\.\d{3}),(\d{1,2})$/.exec(s);
    if (grouped) {
      wholeStr = grouped[1]?.replace(/\./g, '') ?? null;
      fracStr = grouped[2] ?? '';
    }
  }

  if (wholeStr === null) return null;
  const minor = Number(wholeStr) * 100 + Number(fracStr.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > max) return null;
  return minor;
}

export function parseMoney(input: string, code: CurrencyCode): number | null {
  const info = CURRENCIES[code];
  if (info.decimals === 0) return parseIntegerAmount(input, info.max, code === 'VND');
  return parseDecimalAmount(input, info.max);
}
