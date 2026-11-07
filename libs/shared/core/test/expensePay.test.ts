import { describe, it, expect } from 'vitest';
import {
  expenseShareOf,
  rowSlots,
  slotTiles,
  linkedPaid,
  expenseRemaining,
  payerLabel,
} from '../src/expensePay';
import type { ExpenseView, PaymentView } from '../src/api-types';
import { X } from './fixtures';

const baseExpense = X[0]!;

const sport: ExpenseView = {
  id: 'sport1',
  rootId: 'root1',
  description: 'Sân cầu lông',
  amount: 175000,
  spentOn: '2026-11-03',
  payerId: 'nhan',
  mode: 'amounts',
  status: 'approved',
  rejectReason: null,
  disabledByName: null,
  createdById: 'nhan',
  shares: [
    { participantId: 'nhan', amount: 45000, inputValue: 45000 },
    { participantId: 'lan', amount: 85000, inputValue: 85000 },
    { participantId: 'minh', amount: 45000, inputValue: 45000 },
  ],
  meta: {
    sport: {
      court: 175000,
      shuttlecocks: [],
      extra: 0,
      rule: { kind: 'discount', femaleDiscount: 5000 },
      entries: [
        { participantId: 'nhan', maleSlots: 1, femaleSlots: 0 },
        { participantId: 'lan', maleSlots: 1, femaleSlots: 1 },
        { participantId: 'minh', maleSlots: 1, femaleSlots: 0 },
      ],
      femaleSlotRate: 40000,
      maleSlotRate: 45000,
    },
  },
};

const plain: ExpenseView = {
  id: baseExpense.id,
  description: 'Ăn tối',
  amount: 130000,
  spentOn: '2026-11-03',
  payerId: 'nhan',
  mode: 'equal',
  status: 'approved',
  rejectReason: null,
  disabledByName: null,
  createdById: 'nhan',
  shares: [
    { participantId: 'nhan', amount: 65000, inputValue: null },
    { participantId: 'lan', amount: 65000, inputValue: null },
  ],
};

const withFixed: ExpenseView = {
  ...sport,
  id: 'sport-fixed',
  meta: {
    sport: {
      ...sport.meta!.sport!,
      entries: [
        { participantId: 'nhan', maleSlots: 1, femaleSlots: 0 },
        { participantId: 'lan', maleSlots: 1, femaleSlots: 1, fixedAmount: 85000 },
        { participantId: 'minh', maleSlots: 1, femaleSlots: 0 },
      ],
    },
  },
};

const payments: PaymentView[] = [
  {
    id: 'p1',
    fromId: 'lan',
    toId: 'nhan',
    amountClaimed: 45000,
    amountConfirmed: null,
    status: 'says_paid',
    notArrived: false,
    createdAt: '2026-11-03T10:00:00Z',
    disabledByName: null,
    expenseId: 'root1',
    paidBy: 'friend',
  },
  {
    id: 'p2',
    fromId: 'lan',
    toId: 'nhan',
    amountClaimed: 40000,
    amountConfirmed: 30000,
    status: 'confirmed',
    notArrived: false,
    createdAt: '2026-11-03T10:01:00Z',
    disabledByName: null,
    expenseId: 'root1',
    paidBy: 'self',
  },
  {
    id: 'p3',
    fromId: 'lan',
    toId: 'nhan',
    amountClaimed: 10000,
    amountConfirmed: null,
    status: 'rejected',
    notArrived: false,
    createdAt: '2026-11-03T10:02:00Z',
    disabledByName: null,
    expenseId: 'root1',
    paidBy: 'self',
  },
  {
    id: 'p4',
    fromId: 'lan',
    toId: 'nhan',
    amountClaimed: 5000,
    amountConfirmed: 5000,
    status: 'confirmed',
    notArrived: true,
    createdAt: '2026-11-03T10:03:00Z',
    disabledByName: null,
    expenseId: 'root1',
    paidBy: 'self',
  },
  {
    id: 'p5',
    fromId: 'lan',
    toId: 'nhan',
    amountClaimed: 99000,
    amountConfirmed: 99000,
    status: 'confirmed',
    notArrived: false,
    createdAt: '2026-11-03T10:04:00Z',
    disabledByName: null,
    expenseId: 'root2',
    paidBy: 'self',
  },
  {
    id: 'p6',
    fromId: 'minh',
    toId: 'nhan',
    amountClaimed: 7000,
    amountConfirmed: 7000,
    status: 'confirmed',
    notArrived: false,
    createdAt: '2026-11-03T10:05:00Z',
    disabledByName: null,
    expenseId: 'root1',
    paidBy: 'self',
  },
];

describe('expensePay', () => {
  it('expenseShareOf returns the share or 0', () => {
    expect(expenseShareOf(sport, 'lan')).toBe(85000);
    expect(expenseShareOf(sport, 'nobody')).toBe(0);
  });
  it('rowSlots counts both genders, 1 for plain and fixed rows, 0 when absent', () => {
    expect(rowSlots(sport, 'lan')).toBe(2); expect(rowSlots(sport, 'minh')).toBe(1);
    expect(rowSlots(plain, 'lan')).toBe(1); expect(rowSlots(sport, 'nobody')).toBe(0);
    expect(rowSlots(withFixed, 'lan')).toBe(1);
  });
  it('slotTiles drops the person\'s own slot and caps at remaining', () => {
    expect(slotTiles(sport, 'lan', 'F', 85000)).toEqual([{ gender: 'M', amount: 45000 }]);
    expect(slotTiles(sport, 'lan', 'M', 85000)).toEqual([{ gender: 'F', amount: 40000 }]);
    expect(slotTiles(sport, 'lan', null, 30000)).toEqual([{ gender: 'M', amount: 30000 }]); // unknown gender: female slot is "own"
    expect(slotTiles(sport, 'minh', 'M', 45000)).toEqual([]);
    expect(slotTiles(withFixed, 'lan', 'F', 85000)).toEqual([]);
  });
  it('linkedPaid sums says_paid and confirmed for this expense and payer, skipping rejected, not-arrived and other expenses', () => {
    // says_paid 45000 (expenseId root1), confirmed amountConfirmed 30000 (root1), rejected 10000 (root1),
    // confirmed notArrived 5000 (root1), confirmed 99000 (root2), confirmed 7000 (root1 but fromId minh)
    expect(linkedPaid(payments, 'root1', 'lan')).toBe(75000);
  });
  it('expenseRemaining never goes negative and never exceeds the pair debt', () => {
    expect(expenseRemaining(85000, 45000, 200000)).toBe(40000);
    expect(expenseRemaining(40000, 45000, 200000)).toBe(0);
    expect(expenseRemaining(85000, 0, 20000)).toBe(20000);
  });
  it('payerLabel', () => {
    expect(payerLabel({ paidBy: 'friend', fromIsMember: true, slots: 2 })).toBe('friend');
    expect(payerLabel({ paidBy: 'self', fromIsMember: false, slots: 2 })).toBe('name_or_friend');
    expect(payerLabel({ paidBy: 'self', fromIsMember: false, slots: 1 })).toBe('name');
    expect(payerLabel({ paidBy: 'self', fromIsMember: true, slots: 2 })).toBe('name');
  });
  it('PaymentView supports disabledByName', () => {
    const disabledPayment: PaymentView = {
      id: 'p-disabled',
      fromId: 'lan',
      toId: 'nhan',
      amountClaimed: 50000,
      amountConfirmed: null,
      status: 'disabled',
      notArrived: false,
      createdAt: '2026-11-03T10:00:00Z',
      disabledByName: 'Minh',
    };
    const activePayment: PaymentView = {
      ...disabledPayment,
      id: 'p-active',
      status: 'says_paid',
      disabledByName: null,
    };
    expect(disabledPayment.disabledByName).toBe('Minh');
    expect(activePayment.disabledByName).toBeNull();
  });
});
