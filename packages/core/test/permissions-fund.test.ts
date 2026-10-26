import { describe, it, expect } from 'vitest';
import { can, type Actor } from '../src/permissions';

const member = (id: string, isOrganiser = false, isAdmin = false): Actor => ({ kind: 'member', participantId: id, participantPending: false, isOrganiser, isAdmin });
const guest = (id: string, participantPending = false): Actor => ({ kind: 'guest', participantId: id, participantPending, isOrganiser: false });
const viewer: Actor = { kind: 'viewer', participantId: null, participantPending: false, isOrganiser: false };

describe('manage_fund', () => {
  it.each([
    ['organiser', member('O', true), true], ['admin', member('A', false, true), true],
    ['plain member', member('M'), false], ['guest flagged admin', { ...guest('G'), isAdmin: true }, false],
    ['viewer', viewer, false],
  ] as [string, Actor, boolean][])('manage_fund for %s', (_n, actor, expected) => expect(can(actor, 'manage_fund')).toBe(expected));
});
