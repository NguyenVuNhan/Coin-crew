import { describe, it, expect } from 'vitest';
import { vi } from '../vi';

// The Vietnamese copy was reviewed in issue #67. New draft lines may still carry `// REVIEW`
// until someone reviews them; these checks keep the reviewed house style from drifting.
describe('Vietnamese house style', () => {
  const entries = Object.entries(vi);

  it('spells hủy, xóa, hóa and tùy with the accent on the main vowel', () => {
    const offenders = entries.filter(([, text]) => /huỷ|xoá|hoá|tuỳ/i.test(text)).map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it('says "Tắt" rather than the stiff "Vô hiệu hóa" for disable', () => {
    const offenders = entries.filter(([, text]) => /vô hiệu hóa/i.test(text)).map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it('says "Gộp" rather than "Hợp nhất" for merge', () => {
    const offenders = entries.filter(([, text]) => /hợp nhất/i.test(text)).map(([key]) => key);
    expect(offenders).toEqual([]);
  });
});
