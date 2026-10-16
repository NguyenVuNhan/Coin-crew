import { describe, it, expect, beforeEach } from 'vitest';
import { detectLang } from '..';

beforeEach(() => localStorage.clear());

describe('detectLang', () => {
  it('is Vietnamese when nothing is stored, even on an English phone', () => {
    expect(navigator.language.startsWith('vi')).toBe(false);
    expect(detectLang()).toBe('vi');
  });

  it('keeps the language the person picked', () => {
    localStorage.setItem('lang', 'en');
    expect(detectLang()).toBe('en');
    localStorage.setItem('lang', 'vi');
    expect(detectLang()).toBe('vi');
  });
});
