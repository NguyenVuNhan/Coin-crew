import { afterEach, describe, expect, it } from 'vitest';
import { linkTokens } from '../linkTokens';

afterEach(() => localStorage.clear());

describe('linkTokens', () => {
  it('clearAll removes saved group links only', () => {
    linkTokens.set('t-1', 'tok-1');
    linkTokens.set('t-2', 'tok-2');
    localStorage.setItem('lang', 'vi');
    linkTokens.clearAll();
    expect(Object.keys(localStorage)).toEqual(['lang']);
    expect(linkTokens.get('t-1')).toBeNull();
  });
});
