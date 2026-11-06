import { describe, it, expect } from 'vitest';
import { can, type Actor } from '../src/permissions';

const member = (id: string, isOrganiser = false, isAdmin = false): Actor => ({ kind: 'member', participantId: id, participantPending: false, isOrganiser, isAdmin });
const M = member('M');
const ADM = member('A', false, true);
const ORG = member('O', true, true);
const G: Actor = { kind: 'guest', participantId: 'G', participantPending: false, isOrganiser: false };
const V: Actor = { kind: 'viewer', participantId: null, participantPending: false, isOrganiser: false };

describe('remove_person', () => {
  it('an admin removes a non-admin', () => expect(can(ADM, 'remove_person', { targetIsAdmin: false })).toBe(true));
  it('an admin cannot remove another admin', () => expect(can(ADM, 'remove_person', { targetIsAdmin: true })).toBe(false));
  it('the organiser removes an admin', () => expect(can(ORG, 'remove_person', { targetIsAdmin: true })).toBe(true));
  it('members, guests and viewers cannot', () => {
    for (const a of [M, G, V]) expect(can(a, 'remove_person', { targetIsAdmin: false })).toBe(false);
  });
});

describe('leave', () => {
  it('members and admins can leave', () => { expect(can(M, 'leave')).toBe(true); expect(can(ADM, 'leave')).toBe(true); });
  it('the organiser, guests and viewers cannot', () => { for (const a of [ORG, G, V]) expect(can(a, 'leave')).toBe(false); });
});

describe('restore_person', () => {
  it('admins and the organiser bring people back', () => { expect(can(ADM, 'restore_person')).toBe(true); expect(can(ORG, 'restore_person')).toBe(true); });
  it('members, guests and viewers cannot', () => { for (const a of [M, G, V]) expect(can(a, 'restore_person')).toBe(false); });
});
