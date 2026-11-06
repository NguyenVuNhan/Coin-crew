import { describe, it, expect } from 'vitest';
import { normalizeName, findSimilarNames, suggestNames } from '../src/names';

describe('normalizeName', () => {
  it('strips accents, đ, case and extra spaces', () => {
    expect(normalizeName('  Bình ')).toBe('binh');
    expect(normalizeName('Đặng  Thị Chi')).toBe('dang thi chi');
    expect(normalizeName('DŨNG')).toBe('dung');
  });
});

describe('findSimilarNames', () => {
  it('same name without accents', () =>
    expect(findSimilarNames('Binh', [{ id: '1', name: 'Bình' }, { id: '2', name: 'Chi' }])).toEqual([{ id: '1', name: 'Bình', reason: 'same' }]));
  it('one-letter typo', () => expect(findSimilarNames('Chii', [{ id: '1', name: 'Chi' }])[0]?.reason).toBe('typo'));
  it('full name vs short name', () => expect(findSimilarNames('Chi Nguyễn', [{ id: '1', name: 'Chi' }])[0]?.reason).toBe('part'));
  it('short name vs full name', () => expect(findSimilarNames('Minh', [{ id: '1', name: 'Minh Anh' }])[0]?.reason).toBe('part'));
  it('short different names do not match', () => expect(findSimilarNames('An', [{ id: '1', name: 'Anh' }])).toEqual([]));
  it('a one-letter swap in a short name is a different name (Binh vs Minh)', () =>
    expect(findSimilarNames('Binh', [{ id: '1', name: 'Minh' }, { id: '2', name: 'Linh' }])).toEqual([]));
  it('a one-letter swap in a longer name is a typo', () => expect(findSimilarNames('Phuang', [{ id: '1', name: 'Phương' }])[0]?.reason).toBe('typo'));
  it('keeps input order within a reason', () =>
    expect(findSimilarNames('Dung', [{ id: '1', name: 'Dũng' }, { id: '2', name: 'Dung' }]).map((m) => m.id)).toEqual(['1', '2']));
  it('orders same before typo before part', () =>
    expect(findSimilarNames('Chi', [{ id: 'p', name: 'Chi Nguyễn' }, { id: 't', name: 'Chii' }, { id: 's', name: 'chi' }]).map((m) => m.reason))
      .toEqual(['same', 'typo', 'part']));
});

describe('suggestNames', () => {
  it('matches the start of any word', () =>
    expect(suggestNames('ng', [{ id: '1', name: 'Chi Nguyễn' }, { id: '2', name: 'An' }])).toEqual([{ id: '1', name: 'Chi Nguyễn' }]));
  it('empty prefix suggests nothing', () => expect(suggestNames('', [{ id: '1', name: 'An' }])).toEqual([]));
});
