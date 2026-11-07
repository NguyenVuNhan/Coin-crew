import { describe, it, expect } from 'vitest';
import { PRIVACY_CONTACT_EMAIL } from '../../config';

describe('PRIVACY_CONTACT_EMAIL config', () => {
  it('defaults to nguyenvunhan1999@gmail.com when VITE_PRIVACY_EMAIL is unset', () => {
    expect(PRIVACY_CONTACT_EMAIL).toBe('nguyenvunhan1999@gmail.com');
  });
});
