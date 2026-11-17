import { describe, it, expect } from 'vitest';
import { amountSuggestions } from '../amountKeypad';

describe('amountSuggestions cap', () => {
  it('offers chips for small typed numbers', () => {
    expect(amountSuggestions('85', 'VND')).toEqual([85_000, 850_000, 8_500_000]);
    expect(amountSuggestions('5', 'USDT').length).toBeGreaterThan(0);
  });
  it('offers nothing for big typed numbers', () => {
    expect(amountSuggestions('2600000', 'VND')).toEqual([]);
    expect(amountSuggestions('1000', 'VND')).toEqual([]);
    expect(amountSuggestions('150', 'USDT')).toEqual([]);
  });
});
