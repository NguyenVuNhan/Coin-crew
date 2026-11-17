export interface CurrencyInfo {
  decimals: 0 | 2;
  symbol: string;
  max: number;
}

export type CurrencyCode = 'VND' | 'USD' | 'USDT';

export const CURRENCY_CODES: readonly CurrencyCode[] = ['VND', 'USD', 'USDT'] as const;

export const CURRENCIES: {
  readonly VND: CurrencyInfo;
  readonly USD: CurrencyInfo;
  readonly USDT: CurrencyInfo;
} = {
  VND: { decimals: 0, symbol: '₫', max: 1_000_000_000_000 },
  USD: { decimals: 2, symbol: '$', max: 10_000_000_000 },
  USDT: { decimals: 2, symbol: 'USDT', max: 10_000_000_000 },
};

export function isCurrencyCode(x: unknown): x is CurrencyCode {
  return typeof x === 'string' && (CURRENCY_CODES as readonly string[]).includes(x);
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
    return `${sign}${whole}${info.symbol}`;
  }

  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole},${frac} ${info.symbol}`;
}

const SUFFIX_ZEROS = { k: 3, tr: 6 } as const;

function parseVndAmount(input: string): number | null {
  const s = input.trim().toLowerCase();
  let value: number | null = null;

  const suffixed = /^(\d+)(?:[.,](\d+))?\s*(k|tr)$/.exec(s);
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

  if (value === null || !Number.isSafeInteger(value) || value <= 0 || value > CURRENCIES.VND.max) return null;
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
  if (code === 'VND') return parseVndAmount(input);
  return parseDecimalAmount(input, CURRENCIES[code].max);
}
