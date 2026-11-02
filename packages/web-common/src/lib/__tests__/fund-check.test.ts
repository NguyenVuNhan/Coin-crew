import { describe, it, expect } from 'vitest';
import type { TripView } from '@fsl/core';
import { sportFundView } from '../../test/fundFixtures';
import { fundPaidCheck, incomeMinimum } from '../fund';

const atBalance = (balance: number): TripView => sportFundView({ fund: { ...sportFundView().fund!, balance } });

// The API refuses only a write that lowers the fund and leaves it below 0₫ (assertFundCovers); the forms agree.
describe('fundPaidCheck', () => {
  it('a new expense: over the balance is refused, up to it is fine', () => {
    const v = atBalance(400000);
    expect(fundPaidCheck(v, undefined, 400000)).toEqual({ after: 0, over: false });
    expect(fundPaidCheck(v, undefined, 400001)).toEqual({ after: -1, over: true });
  });

  it('a new expense at 0₫: even 1₫ is refused', () => {
    expect(fundPaidCheck(atBalance(0), undefined, 1).over).toBe(true);
  });

  it('an approved fund-paid expense may spend its own amount again', () => {
    const v = atBalance(400000);
    const e = v.expenses[0]!; // 150.000₫
    expect(fundPaidCheck(v, e, 550000)).toEqual({ after: 0, over: false });
    expect(fundPaidCheck(v, e, 550001).over).toBe(true);
  });

  it('below 0₫ after a race, keeping or lowering an approved fund-paid expense is fine; raising it is not', () => {
    const v = atBalance(-50000);
    const e = v.expenses[0]!; // 150.000₫
    expect(fundPaidCheck(v, e, 150000)).toEqual({ after: -50000, over: false });
    expect(fundPaidCheck(v, e, 100000)).toEqual({ after: 0, over: false });
    expect(fundPaidCheck(v, e, 150001).over).toBe(true);
  });

  it('a disabled fund-paid expense takes nothing from the fund, whatever its amount', () => {
    const v = atBalance(0);
    const e = { ...v.expenses[0]!, status: 'disabled' as const };
    expect(fundPaidCheck(v, e, 900000)).toEqual({ after: 0, over: false });
  });

  it('an expense someone paid, turned into a fund-paid one, is checked like a new one', () => {
    const v = atBalance(400000);
    const e = v.expenses.find((x) => !x.meta?.paidFromFund)!;
    expect(fundPaidCheck(v, e, 400000).over).toBe(false);
    expect(fundPaidCheck(v, e, 400001).over).toBe(true);
  });
});

describe('incomeMinimum below 0₫', () => {
  it('is the whole income: lowering it is refused, keeping it is not', () => {
    const v = atBalance(-50000);
    expect(incomeMinimum(v, v.fund!.incomes[0]!)).toBe(200000);
  });
});
