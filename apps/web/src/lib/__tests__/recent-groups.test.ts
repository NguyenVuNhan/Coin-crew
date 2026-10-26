import { describe, it, expect } from 'vitest';
import type { ExpenseStatus, ExpenseView, PersonView } from '@fsl/core';
import { recentGroups } from '../recentGroups';

const person = (id: string): PersonView => ({ id, name: id.toUpperCase(), status: 'active', isMember: false, bank: 'none' });
const offered = ['p1', 'p2', 'p3', 'p4', 'p5'].map(person);

const expense = (id: string, people: string[], status: ExpenseStatus = 'approved'): ExpenseView => ({
  id, description: `Expense ${id}`, amount: 100000, spentOn: '2026-10-20', payerId: 'p1', mode: 'equal', status,
  rejectReason: null, disabledByName: null, createdById: 'p1',
  shares: people.map((participantId) => ({ participantId, amount: 1, inputValue: 1 })),
});

const ids = (groups: { expenseId: string }[]) => groups.map((g) => g.expenseId);

describe('recentGroups', () => {
  it('newest first, at most 3', () => {
    const expenses = [
      expense('e1', ['p1', 'p2']),
      expense('e2', ['p2', 'p3']),
      expense('e3', ['p3', 'p4']),
      expense('e4', ['p4', 'p5']),
      expense('e5', ['p1', 'p3']),
    ];
    expect(ids(recentGroups(expenses, offered, new Set(), undefined))).toEqual(['e1', 'e2', 'e3']);
  });

  it('skips rejected and disabled expenses', () => {
    const expenses = [expense('e1', ['p1', 'p2'], 'rejected'), expense('e2', ['p2', 'p3'], 'disabled'), expense('e3', ['p3', 'p4'], 'pending')];
    expect(ids(recentGroups(expenses, offered, new Set(), undefined))).toEqual(['e3']);
  });

  it('skips the expense being edited', () => {
    const expenses = [expense('e1', ['p1', 'p2']), expense('e2', ['p2', 'p3'])];
    expect(ids(recentGroups(expenses, offered, new Set(), 'e1'))).toEqual(['e2']);
  });

  it('drops people who are not offered, and skips a group that becomes empty', () => {
    const groups = recentGroups([expense('e1', ['p1', 'p9']), expense('e2', ['p9'])], offered, new Set(), undefined);
    expect(groups.map((g) => g.people)).toEqual([['p1']]);
  });

  it('skips everyone, the current selection and repeats', () => {
    const expenses = [
      expense('e1', ['p1', 'p2', 'p3', 'p4', 'p5']),
      expense('e2', ['p2', 'p1']),
      expense('e3', ['p3', 'p4']),
      expense('e4', ['p4', 'p3']),
    ];
    expect(ids(recentGroups(expenses, offered, new Set(['p1', 'p2']), undefined))).toEqual(['e3']);
  });

  it('lists people in group order and carries the description and date', () => {
    expect(recentGroups([expense('e1', ['p3', 'p1'])], offered, new Set(), undefined)).toEqual([
      { expenseId: 'e1', description: 'Expense e1', spentOn: '2026-10-20', people: ['p1', 'p3'] },
    ]);
  });
});
