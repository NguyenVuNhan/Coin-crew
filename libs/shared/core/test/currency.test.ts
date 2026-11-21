import { describe, it, expect } from 'vitest';
import {
  CURRENCIES,
  CURRENCY_CODES,
  isCurrencyCode,
  isValidAmount,
  formatMoney,
  parseMoney,
  searchCurrencies,
  type CurrencyCode,
} from '../src/currency';

describe('CURRENCIES and isCurrencyCode', () => {
  it('defines the 55-currency catalog starting with VND, USD, USDT', () => {
    expect(CURRENCY_CODES).toHaveLength(55);
    expect(CURRENCY_CODES.slice(0, 3)).toEqual(['VND', 'USD', 'USDT']);
    for (const code of CURRENCY_CODES) {
      const info = CURRENCIES[code];
      expect(info.nameVi.length).toBeGreaterThan(0);
      expect(info.nameEn.length).toBeGreaterThan(0);
      expect(info.badge.length).toBeGreaterThan(0);
      expect(['fiat', 'crypto']).toContain(info.kind);
      expect([0, 2]).toContain(info.decimals);
    }
    for (const code of CURRENCY_CODES.slice(0, 12)) {
      expect(CURRENCIES[code].popular).toBe(true);
    }
  });

  it('validates currency codes', () => {
    expect(isCurrencyCode('VND')).toBe(true);
    expect(isCurrencyCode('USD')).toBe(true);
    expect(isCurrencyCode('USDT')).toBe(true);
    expect(isCurrencyCode('EUR')).toBe(true);
    expect(isCurrencyCode('JPY')).toBe(true);
    expect(isCurrencyCode('USDC')).toBe(true);
    expect(isCurrencyCode('XXX')).toBe(false);
    expect(isCurrencyCode(null)).toBe(false);
    expect(isCurrencyCode(123)).toBe(false);
  });
});

describe('formatMoney', () => {
  it.each([
    [1234567, 'VND', '1.234.567₫'],
    [-5000, 'VND', '-5.000₫'],
    [1000, 'JPY', '1.000¥'],
    [100_000, 'IDR', '100.000 Rp'],
    [123456, 'USD', '1.234,56 $'],
    [123456, 'EUR', '1.234,56 €'],
    [5, 'USDT', '0,05 USDT'],
    [-100, 'USD', '-1,00 $'],
  ])('%d %s → %s', (m, c, out) => expect(formatMoney(m, c as CurrencyCode)).toBe(out));
});

describe('parseMoney', () => {
  it.each([
    ['50k', 'VND', 50000], ['1.234.567', 'VND', 1234567], ['2tr', 'VND', 2000000],
    ['1.000', 'JPY', 1000], ['1000', 'KRW', 1000],
    ['12', 'USD', 1200], ['12,5', 'USD', 1250], ['12.50', 'USD', 1250], ['1.234,56', 'USD', 123456],
    ['0,01', 'USDT', 1],
    ['1.234.567', 'USD', 123456700], ['1.234.567,89', 'USDT', 123456789],
  ])('%s %s → %d', (s, c, v) => expect(parseMoney(s, c as CurrencyCode)).toBe(v));

  it.each([
    ['12,345', 'USD'], ['50k', 'USD'], ['50k', 'JPY'], ['12.5', 'JPY'],
    ['0', 'VND'], ['-5', 'VND'], ['abc', 'USDT'],
    ['100000001', 'USD'], ['1000000000001', 'VND'],
    ['1.234', 'USD'], ['1,234.56', 'USD'], ['0,00', 'USDT'],
  ])('%s %s → null', (s, c) => expect(parseMoney(s, c as CurrencyCode)).toBeNull());
});

describe('searchCurrencies', () => {
  it('returns all 55 codes for empty query and matches accent-folded names and badges', () => {
    expect(searchCurrencies('')).toHaveLength(55);
    expect(searchCurrencies('   ')).toHaveLength(55);
    expect(searchCurrencies('do la my')).toContain('USD');
    expect(searchCurrencies('yen nhat')).toContain('JPY');
    expect(searchCurrencies('₮')).toContain('USDT');
  });
});

describe('isValidAmount', () => {
  it('rejects floats, zero and over-max by default', () => {
    expect(isValidAmount(1.5, 'USD')).toBe(false);
    expect(isValidAmount(0, 'VND')).toBe(false);
    expect(isValidAmount(10_000_000_001, 'USDT')).toBe(false);
    expect(isValidAmount(-10, 'VND', { allowNegative: true, allowZero: true })).toBe(true);
  });

  it('respects allowZero, allowNegative, and negative max bounds', () => {
    expect(isValidAmount(0, 'VND', { allowZero: true })).toBe(true);
    expect(isValidAmount(-10, 'VND')).toBe(false);
    expect(isValidAmount(-10_000_000_001, 'USD', { allowNegative: true })).toBe(false);
    expect(isValidAmount(1_000_000_000_000, 'VND')).toBe(true);
    expect(isValidAmount(1_000_000_000_001, 'VND')).toBe(false);
  });
});
