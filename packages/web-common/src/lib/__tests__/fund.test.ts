import { describe, it, expect } from 'vitest';
import { tripView } from '../../test/fixtures';
import { sportFundView, sportMemberView } from '../../test/fundFixtures';
import { fundAvailable, fundOf, incomeMinimum, isFundAdmin, mergeFeed, showFund } from '../fund';

describe('fund helpers', () => {
  it('fundOf reads a missing fund as null', () => expect(fundOf(tripView())).toBeNull());

  it('showFund needs a fund with history', () => {
    expect(showFund(sportFundView())).toBe(true);
    expect(showFund(sportFundView({ fund: { balance: 0, added: 0, spent: 0, incomes: [] }, expenses: tripView().expenses }))).toBe(false);
    expect(showFund(tripView())).toBe(false);
  });

  it('isFundAdmin: sport, admin, not archived', () => {
    expect(isFundAdmin(sportFundView())).toBe(true);
    expect(isFundAdmin(sportMemberView())).toBe(false);
    expect(isFundAdmin(sportFundView({ trip: { ...sportFundView().trip, archived: true } }))).toBe(false);
    expect(isFundAdmin(tripView())).toBe(false);
  });

  it('fundAvailable adds back the expense being edited', () => {
    const v = sportFundView();
    expect(fundAvailable(v)).toBe(400000);
    expect(fundAvailable(v, v.expenses[0])).toBe(550000);
    expect(fundAvailable(v, { ...v.expenses[0]!, status: 'disabled' })).toBe(400000);
  });

  it('incomeMinimum is what is already spent', () => {
    const v = sportFundView({ fund: { ...sportFundView().fund!, balance: 50000 } });
    expect(incomeMinimum(v, v.fund!.incomes[1]!)).toBe(250000);
    expect(incomeMinimum(v, v.fund!.incomes[3]!)).toBe(0);
  });

  it('mergeFeed: newest first across both lists; expenses without createdAt last', () => {
    const v = sportFundView();
    expect(mergeFeed(v.expenses, v.fund!.incomes).slice(0, 6).map((f) => f.item.id)).toEqual(['e-f1', 'i-1', 'i-2', 'e-f2', 'i-3', 'i-4']);
  });
});
