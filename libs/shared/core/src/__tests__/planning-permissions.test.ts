import { describe, it, expect } from 'vitest';
import { can, isPlanningExpense, fundSummary, type Actor } from '../index';

const admin: Actor = { kind: 'member', participantId: 'p-1', participantPending: false, isOrganiser: false, isAdmin: true };
const organiser: Actor = { kind: 'member', participantId: 'p-0', participantPending: false, isOrganiser: true, isAdmin: false };
const member: Actor = { kind: 'member', participantId: 'p-2', participantPending: false, isOrganiser: false, isAdmin: false };
const guest: Actor = { kind: 'guest', participantId: 'p-3', participantPending: false, isOrganiser: false };

describe('planning permissions and helpers', () => {
  it('grants plan_session only to group admins and organisers', () => {
    expect(can(admin, 'plan_session')).toBe(true);
    expect(can(organiser, 'plan_session')).toBe(true);
    expect(can(member, 'plan_session')).toBe(false);
    expect(can(guest, 'plan_session')).toBe(false);
  });

  it('allows any group admin to edit or delete a planning expense regardless of creator', () => {
    expect(can(admin, 'edit_expense', { expenseCreatedById: 'p-0', expenseStatus: 'approved', isPlanning: true })).toBe(true);
    expect(can(organiser, 'edit_expense', { expenseCreatedById: 'p-1', expenseStatus: 'approved', isPlanning: true })).toBe(true);
    expect(can(member, 'edit_expense', { expenseCreatedById: 'p-0', expenseStatus: 'approved', isPlanning: true })).toBe(false);
    // Once completed (isPlanning: false), creator-only rule applies
    expect(can(admin, 'edit_expense', { expenseCreatedById: 'p-0', expenseStatus: 'approved', isPlanning: false })).toBe(false);
  });

  it('identifies planning expenses and excludes them from fundSummary', () => {
    const planned = {
      amount: 168000,
      status: 'approved',
      meta: {
        paidFromFund: true,
        sport: { planning: true, court: 168000, shuttlecocks: [], extra: 0, rule: { kind: 'equal' as const }, entries: [], maleSlotRate: 0, femaleSlotRate: 0 },
      },
    };
    expect(isPlanningExpense(planned)).toBe(true);
    expect(fundSummary([{ id: 'i1', amount: 500000, status: 'approved' }], [planned])).toEqual({
      balance: 500000,
      added: 500000,
      spent: 0,
    });
  });
});
