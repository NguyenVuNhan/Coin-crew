import { describe, it, expect } from 'vitest';
import {
  can, initialExpenseStatus, statusForNewPayment, canConfirmPayment, notArrivedOutcome,
  type Actor, type Action, type ActionContext,
} from '../src/permissions';

const member = (id: string, isOrganiser = false): Actor => ({ kind: 'member', participantId: id, participantPending: false, isOrganiser });
const guest = (id: string, participantPending = false): Actor => ({ kind: 'guest', participantId: id, participantPending, isOrganiser: false });
const viewer: Actor = { kind: 'viewer', participantId: null, participantPending: false, isOrganiser: false };

const M = member('M');
const ORG = member('O', true);
const G = guest('G');
const GP = guest('GP', true);

type Row = [string, Actor, Action, ActionContext | undefined, boolean];
const rows: Row[] = [
  ['member view', M, 'view', undefined, true],
  ['guest view', G, 'view', undefined, true],
  ['pending view', GP, 'view', undefined, true],
  ['viewer view', viewer, 'view', undefined, true],
  ['member add', M, 'add_expense', undefined, true],
  ['guest add', G, 'add_expense', undefined, true],
  ['pending add', GP, 'add_expense', undefined, true],
  ['viewer add', viewer, 'add_expense', undefined, false],
];
for (const action of ['edit_expense', 'delete_expense'] as const) {
  rows.push(
    [`member ${action} of someone else, approved`, M, action, { expenseCreatedById: 'X', expenseStatus: 'approved' }, true],
    [`guest ${action} own pending`, G, action, { expenseCreatedById: 'G', expenseStatus: 'pending' }, true],
    [`guest ${action} own approved`, G, action, { expenseCreatedById: 'G', expenseStatus: 'approved' }, false],
    [`guest ${action} of someone else, pending`, G, action, { expenseCreatedById: 'X', expenseStatus: 'pending' }, false],
    [`pending ${action} own pending`, GP, action, { expenseCreatedById: 'GP', expenseStatus: 'pending' }, true],
    [`viewer ${action}`, viewer, action, { expenseCreatedById: 'X', expenseStatus: 'pending' }, false],
  );
}
for (const action of ['approve', 'disable', 'merge', 'remove_person', 'regenerate_links', 'set_fewest'] as const) {
  rows.push(
    [`member ${action}`, M, action, undefined, true],
    [`guest ${action}`, G, action, undefined, false],
    [`pending ${action}`, GP, action, undefined, false],
    [`viewer ${action}`, viewer, action, undefined, false],
  );
}
rows.push(
  ['organiser archive', ORG, 'archive', undefined, true],
  ['member archive', M, 'archive', undefined, false],
  ['guest archive', G, 'archive', undefined, false],
  ['member own bank', M, 'set_own_bank', undefined, true],
  ['guest own bank', G, 'set_own_bank', undefined, true],
  ['pending own bank', GP, 'set_own_bank', undefined, false],
  ['viewer own bank', viewer, 'set_own_bank', undefined, false],
  ['member records as payer', M, 'record_payment', { paymentFromId: 'M', paymentToId: 'G' }, true],
  ['member records as receiver', M, 'record_payment', { paymentFromId: 'G', paymentToId: 'M' }, true],
  ['guest records as payer', G, 'record_payment', { paymentFromId: 'G', paymentToId: 'M' }, true],
  ['guest not a party', G, 'record_payment', { paymentFromId: 'A', paymentToId: 'M' }, false],
  ['member not a party', M, 'record_payment', { paymentFromId: 'A', paymentToId: 'B' }, false],
  ['pending records', GP, 'record_payment', { paymentFromId: 'GP', paymentToId: 'M' }, false],
  ['viewer records', viewer, 'record_payment', { paymentFromId: 'A', paymentToId: 'M' }, false],
  ['member views bank when owing', M, 'view_bank', { owesTo: true }, true],
  ['guest views bank when owing', G, 'view_bank', { owesTo: true }, true],
  ['guest views bank when not owing', G, 'view_bank', { owesTo: false }, false],
  ['pending views bank', GP, 'view_bank', { owesTo: true }, false],
  ['viewer views bank', viewer, 'view_bank', { owesTo: true }, false],
);

describe('can', () => {
  it.each(rows)('%s', (_name, actor, action, ctx, expected) => expect(can(actor, action, ctx)).toBe(expected));
});

describe('initialExpenseStatus', () => {
  it('members count straight away, guests wait', () => {
    expect(initialExpenseStatus(M)).toBe('approved');
    expect(initialExpenseStatus(G)).toBe('pending');
    expect(initialExpenseStatus(GP)).toBe('pending');
  });
});

describe('statusForNewPayment', () => {
  const s = (actorId: string, fromId: string, toId: string, receiverIsMember: boolean) =>
    statusForNewPayment({ actorId, fromId, toId, receiverIsMember });
  it('guest → member, payer records', () => expect(s('C', 'C', 'M', true)).toBe('says_paid'));
  it('member marks received', () => expect(s('M', 'C', 'M', true)).toBe('confirmed'));
  it('member → guest, payer records', () => expect(s('M', 'M', 'C', false)).toBe('confirmed'));
  it('receiving guest marks received', () => expect(s('C', 'M', 'C', false)).toBe('confirmed'));
  it('guest → guest, payer records', () => expect(s('A', 'A', 'C', false)).toBe('confirmed'));
  it('guest → guest, receiver records', () => expect(s('C', 'A', 'C', false)).toBe('confirmed'));
  it('member → member, payer records', () => expect(s('M', 'M', 'N', true)).toBe('says_paid'));
  it('member → member, receiver records', () => expect(s('N', 'M', 'N', true)).toBe('confirmed'));
  it('third party', () => expect(s('B', 'A', 'M', true)).toBe('forbidden'));
});

describe('canConfirmPayment', () => {
  it('receiving member, says_paid', () => expect(canConfirmPayment(member('M'), { toId: 'M', status: 'says_paid' }, true)).toBe(true));
  it('already confirmed', () => expect(canConfirmPayment(member('M'), { toId: 'M', status: 'confirmed' }, true)).toBe(false));
  it('member who is not the receiver', () => expect(canConfirmPayment(member('N'), { toId: 'M', status: 'says_paid' }, true)).toBe(false));
  it('guest receiver never confirms', () => expect(canConfirmPayment(guest('C'), { toId: 'C', status: 'says_paid' }, false)).toBe(false));
});

describe('notArrivedOutcome', () => {
  it('member receiver rejects says_paid', () => expect(notArrivedOutcome(member('M'), { toId: 'M', status: 'says_paid' }, true)).toBe('reject'));
  it('guest receiver flags confirmed', () => expect(notArrivedOutcome(guest('C'), { toId: 'C', status: 'confirmed' }, false)).toBe('flag'));
  it('not the receiver', () => expect(notArrivedOutcome(guest('A'), { toId: 'C', status: 'confirmed' }, false)).toBe('forbidden'));
  it('member receiver on confirmed', () => expect(notArrivedOutcome(member('M'), { toId: 'M', status: 'confirmed' }, true)).toBe('forbidden'));
  it('viewer', () => expect(notArrivedOutcome(viewer, { toId: 'C', status: 'confirmed' }, false)).toBe('forbidden'));
});
