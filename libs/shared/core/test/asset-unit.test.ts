import { describe, expect, it } from 'vitest';
import { assetQuantityLabel, assetUnitText, parseAssetUnit } from '../src/assets';

describe('parseAssetUnit', () => {
  it('parses power-of-ten steps into empty unit and decimals', () => {
    expect(parseAssetUnit('0.0001')).toEqual({ unit: '', decimals: 4 });
    expect(parseAssetUnit('0,01')).toEqual({ unit: '', decimals: 2 });
    expect(parseAssetUnit('1')).toEqual({ unit: '', decimals: 0 });
    expect(parseAssetUnit('0.00000001')).toEqual({ unit: '', decimals: 8 });
  });

  it('parses word units with 2 decimals', () => {
    expect(parseAssetUnit('chỉ')).toEqual({ unit: 'chỉ', decimals: 2 });
    expect(parseAssetUnit('  cổ phiếu  ')).toEqual({ unit: 'cổ phiếu', decimals: 2 });
  });

  it('rejects non-power-of-ten numbers, over-precision, and empty input', () => {
    expect(parseAssetUnit('0.0005')).toBeNull();
    expect(parseAssetUnit('10')).toBeNull();
    expect(parseAssetUnit('0')).toBeNull();
    expect(parseAssetUnit('0.000000001')).toBeNull();
    expect(parseAssetUnit('')).toBeNull();
    expect(parseAssetUnit('   ')).toBeNull();
  });
});

describe('assetUnitText', () => {
  it('round-trips with parseAssetUnit', () => {
    const cases = [
      { unit: '', decimals: 0 },
      { unit: '', decimals: 1 },
      { unit: '', decimals: 4 },
      { unit: '', decimals: 8 },
      { unit: 'chỉ', decimals: 2 },
    ];
    for (const c of cases) {
      const text = assetUnitText(c);
      expect(parseAssetUnit(text)).toEqual(c);
    }
    expect(assetUnitText({ unit: '', decimals: 4 })).toBe('0.0001');
    expect(assetUnitText({ unit: '', decimals: 0 })).toBe('1');
    expect(assetUnitText({ unit: 'chỉ', decimals: 2 })).toBe('chỉ');
  });
});

describe('assetQuantityLabel', () => {
  it('falls back to asset name when unit is empty', () => {
    expect(assetQuantityLabel(481, { name: 'BTC', unit: '', decimals: 4 })).toBe('0,0481 BTC');
    expect(assetQuantityLabel(250, { name: 'Vàng', unit: 'chỉ', decimals: 2 })).toBe('2,5 chỉ');
  });
});
