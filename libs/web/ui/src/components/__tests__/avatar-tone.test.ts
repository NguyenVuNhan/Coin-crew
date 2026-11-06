import { describe, expect, it } from 'vitest';
import { avatarTone } from '../Avatar';

describe('avatarTone', () => {
  it('spreads a real group over the palette', () => {
    const names = ['Minh', 'Bình', 'Chi', 'Tuấn Anh', 'Dũng', 'Nguyễn Thị Thanh Hương'];
    const tones = names.map(avatarTone);
    expect(tones).toEqual([4, 5, 6, 3, 6, 1]);
    expect(new Set(tones).size).toBeGreaterThanOrEqual(5);
  });

  it('ignores accents, capitals and spacing', () => {
    expect(avatarTone('Bình')).toBe(avatarTone('binh'));
    expect(avatarTone('binh')).toBe(avatarTone('  BINH '));
  });
});
