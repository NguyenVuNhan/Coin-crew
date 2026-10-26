import { describe, it, expect } from 'vitest';
import { matchesWordStart } from '../nameSearch';

describe('matchesWordStart', () => {
  it('matches the start of any word, ignoring tone marks and đ', () => {
    expect(matchesWordStart('lo', 'Hà Lộc')).toBe(true);
    expect(matchesWordStart('loc', 'Hà Lộc')).toBe(true);
    expect(matchesWordStart('duc', 'Đức')).toBe(true);
    expect(matchesWordStart('MINH', 'Minh')).toBe(true);
  });

  it('does not match the middle of a word', () => expect(matchesWordStart('oc', 'Hà Lộc')).toBe(false));

  it('matches across words', () => expect(matchesWordStart('ha l', 'Hà Lộc')).toBe(true));

  it('a blank query matches everyone', () => expect(matchesWordStart('  ', 'An')).toBe(true));
});
