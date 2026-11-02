import { describe, it, expect } from 'vitest';
import { screenName } from '../screenName';

describe('screenName', () => {
  it.each([
    ['/', 'landing'],
    ['/trips', 'trips'],
    ['/groups', 'groups'],
    ['/activity', 'my-activity'],
    ['/trips/new', 'create-trip'],
    ['/people/u:abc', 'person'],
    ['/r/secret-token', 'request'],
    ['/privacy', 'privacy'],
    ['/me/bank', 'my-bank'],
    ['/t/abc123', 'trip'],
    ['/t/abc123/', 'trip'],
    ['/t/abc123/expenses/xyz/edit', 'trip-expenses'],
    ['/t/abc123/people', 'trip-people'],
    ['/t/abc123/settings', 'trip-settings'],
    ['/t/abc123/pay/p-1', 'trip-pay'],
    ['/j/secret-token', 'guest-trip'],
    ['/j/secret-token/e/x', 'guest-trip'],
    ['/something/else', 'other'],
  ])('%s → %s', (path, name) => {
    expect(screenName(path)).toBe(name);
  });

  it('never leaks odd segments', () => {
    expect(screenName('/t/abc/WEIRD_Seg!')).toBe('trip-other');
  });
});
