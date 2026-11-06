import { describe, expect, it } from 'vitest';
import { can, type Actor } from '../src/permissions';
import { DEFAULT_THEME, isThemeId, resolveTheme, THEME_IDS } from '../src/themes';

const member = (id: string, isOrganiser = false, isAdmin = false): Actor => ({
  kind: 'member',
  participantId: id,
  participantPending: false,
  isOrganiser,
  isAdmin,
});
const guest = (id: string, participantPending = false): Actor => ({
  kind: 'guest',
  participantId: id,
  participantPending,
  isOrganiser: false,
});
const viewer: Actor = {
  kind: 'viewer',
  participantId: null,
  participantPending: false,
  isOrganiser: false,
};

describe('themes', () => {
  it('resolveTheme: the group wins', () => {
    expect(resolveTheme({ personal: 'sky', group: 'orchid' })).toBe('orchid');
  });

  it('personal when the group has none', () => {
    expect(resolveTheme({ personal: 'sky', group: null })).toBe('sky');
  });

  it('guests get jade', () => {
    expect(resolveTheme({ personal: null, group: null })).toBe('jade');
    expect(DEFAULT_THEME).toBe('jade');
  });

  it('unknown ids fall back to jade', () => {
    expect(resolveTheme({ personal: 'pink', group: 'neon' })).toBe('jade');
    expect(resolveTheme({ personal: 'sky', group: 'neon' })).toBe('sky');
  });

  it('isThemeId accepts the four theme ids and rejects everything else', () => {
    expect(THEME_IDS).toEqual(['jade', 'orchid', 'sky', 'indigo']);
    for (const id of THEME_IDS) {
      expect(isThemeId(id)).toBe(true);
    }
    expect(isThemeId('Jade')).toBe(false);
    expect(isThemeId('')).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(3)).toBe(false);
  });

  it('set_theme permission is restricted to admins and the organiser', () => {
    expect(can(member('A', false, true), 'set_theme')).toBe(true);
    expect(can(member('O', true, false), 'set_theme')).toBe(true);
    expect(can(member('M', false, false), 'set_theme')).toBe(false);
    expect(can(guest('G'), 'set_theme')).toBe(false);
    expect(can(viewer, 'set_theme')).toBe(false);
  });
});
