import { describe, it, expect } from 'vitest';
import { isFundPaid, fundEffect, fundSummary, type LedgerIncome } from '../src/fund';

const fund = { paidFromFund: true };

describe('fund helpers', () => {
  it('isFundPaid reads meta.paidFromFund', () => {
    expect(isFundPaid({ meta: fund })).toBe(true);
    expect(isFundPaid({ meta: null })).toBe(false);
    expect(isFundPaid({})).toBe(false);
    expect(isFundPaid({ meta: { paidFromFund: false } })).toBe(false);
  });
  it('fundEffect counts approved income up and approved fund-paid expenses down, nothing else', () => {
    expect(fundEffect({ kind: 'income', amount: 200000, status: 'approved' })).toBe(200000);
    expect(fundEffect({ kind: 'income', amount: 200000, status: 'disabled' })).toBe(0);
    expect(fundEffect({ kind: 'income', amount: 200000, status: 'superseded' })).toBe(0);
    expect(fundEffect({ kind: 'expense', amount: 150000, status: 'approved', meta: fund })).toBe(-150000);
    for (const status of ['pending', 'rejected', 'disabled', 'superseded']) {
      expect(fundEffect({ kind: 'expense', amount: 150000, status, meta: fund })).toBe(0);
    }
    expect(fundEffect({ kind: 'expense', amount: 600000, status: 'approved', meta: null })).toBe(0);
  });
  it('fundSummary: 650.000 added − 250.000 spent = 400.000', () => {
    const incomes: LedgerIncome[] = [
      { id: 'i-1', amount: 200000, status: 'approved' }, { id: 'i-2', amount: 300000, status: 'approved' },
      { id: 'i-3', amount: 150000, status: 'approved' }, { id: 'i-4', amount: 100000, status: 'disabled' },
    ];
    const expenses = [
      { amount: 150000, status: 'approved', meta: fund }, { amount: 100000, status: 'approved', meta: fund },
      { amount: 600000, status: 'approved', meta: null }, { amount: 50000, status: 'disabled', meta: fund },
    ];
    expect(fundSummary(incomes, expenses)).toEqual({ balance: 400000, added: 650000, spent: 250000 });
    expect(fundSummary([], [])).toEqual({ balance: 0, added: 0, spent: 0 });
  });
});
