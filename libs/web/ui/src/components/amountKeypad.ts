import { CURRENCIES, type CurrencyCode } from '@cc/core';

const OPERATOR_SPLIT_RE = /([+\-\u2212])/;

function parseTermMinor(term: string, decimals: 0 | 2): number | null {
  if (decimals === 0) {
    if (!/^\d+$/.test(term)) return null;
    const value = Number(term);
    return Number.isSafeInteger(value) ? value : null;
  }

  const match = /^(\d+)(?:,(\d{1,2}))?$/.exec(term);
  if (!match) return null;
  const whole = Number(match[1]);
  const frac = Number((match[2] ?? '').padEnd(2, '0'));
  const minor = whole * 100 + frac;
  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * Evaluates a keypad amount expression (e.g. '120000+35000' or '10,00−2,50')
 * into minor units (VND whole đồng; USD/USDT cents), or null if invalid, <= 0, or above max.
 */
export function evaluateAmountExpression(expr: string, code: CurrencyCode): number | null {
  if (!expr) return null;

  const info = CURRENCIES[code];
  const parts = expr.split(OPERATOR_SPLIT_RE);
  if (parts.length % 2 === 0) return null;

  const first = parseTermMinor(parts[0] ?? '', info.decimals);
  if (first === null) return null;

  let total = first;
  for (let i = 1; i < parts.length; i += 2) {
    const op = parts[i];
    const rhs = parseTermMinor(parts[i + 1] ?? '', info.decimals);
    if (rhs === null) return null;

    total = op === '+' ? total + rhs : total - rhs;
    if (!Number.isSafeInteger(total)) return null;
  }

  if (total <= 0 || total > info.max) return null;
  return total;
}

/**
 * Returns up to 3 scaled amount suggestions in minor units when expr is a single
 * positive integer with no operator and no decimal mark.
 */
export function amountSuggestions(expr: string, code: CurrencyCode): number[] {
  if (!/^\d+$/.test(expr)) return [];

  const typed = Number(expr);
  if (!Number.isSafeInteger(typed) || typed <= 0) return [];

  const { decimals, max } = CURRENCIES[code];
  const multipliers = decimals === 0 ? [1_000, 10_000, 100_000] : [100, 1_000];

  const results: number[] = [];
  for (const mult of multipliers) {
    const scaled = typed * mult;
    if (Number.isSafeInteger(scaled) && scaled !== typed && scaled <= max) {
      results.push(scaled);
    }
  }

  return results.slice(0, 3);
}

/** Formats a minor-unit amount back into keypad input form. */
export function formatKeypadValue(minor: number, code: CurrencyCode): string {
  if (CURRENCIES[code].decimals === 0) {
    return String(Math.trunc(minor));
  }
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${whole},${frac}`;
}

export function applyKeypadDigit(value: string, digit: string): string {
  return value + digit;
}

export function applyKeypadTripleZero(value: string): string {
  const currentTerm = value.split(OPERATOR_SPLIT_RE).pop() ?? '';
  if (currentTerm.length === 0 || currentTerm === '0' || currentTerm.includes(',')) {
    return value;
  }
  return value + '000';
}

export function applyKeypadOperator(value: string, op: '+' | '−'): string {
  if (value.length === 0) return value;
  const last = value.slice(-1);
  if (last === '+' || last === '-' || last === '−' || last === ',') {
    return value;
  }
  return value + op;
}

export function applyKeypadComma(value: string, code: CurrencyCode): string {
  if (CURRENCIES[code].decimals === 0) return value;
  const currentTerm = value.split(OPERATOR_SPLIT_RE).pop() ?? '';
  if (currentTerm.includes(',')) return value;
  if (currentTerm.length === 0) return value + '0,';
  return value + ',';
}
