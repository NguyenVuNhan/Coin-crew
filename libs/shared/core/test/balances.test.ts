import { describe, it, expect } from 'vitest';
import { computeBalances, type LedgerPayment } from '../src/balances';
import { P, X, E5 } from './fixtures';

describe('computeBalances', () => {
  it('mockup trip balances', () => expect(computeBalances(P, X, [])).toEqual({ M: 2195000, A: -385000, B: -565000, C: -1245000 }));
  it('ignores pending expenses by default', () => expect(computeBalances(P, [...X, E5], [])).toEqual({ M: 2195000, A: -385000, B: -565000, C: -1245000 }));
  it('includes own pending when asked', () => expect(computeBalances(P, [...X, E5], [], { includePendingCreatedBy: 'C' })).toMatchObject({ C: -1110000, M: 2150000 }));
  it('ignores disabled expenses', () => expect(computeBalances(P, [{ ...X[0]!, status: 'disabled' }, ...X.slice(1)], [])).toMatchObject({ M: -205000 }));
  it('ignores rejected expenses', () => expect(computeBalances(P, [{ ...X[0]!, status: 'rejected' }, ...X.slice(1)], [])).toMatchObject({ M: -205000 }));

  const saysPaid: LedgerPayment = { id: 'p1', fromId: 'B', toId: 'M', amount: 565000, status: 'says_paid' };
  it('says_paid does not change balances', () => expect(computeBalances(P, X, [saysPaid])).toMatchObject({ B: -565000, M: 2195000 }));
  it('says_paid counts when includeSaysPaid', () => expect(computeBalances(P, X, [saysPaid], { includeSaysPaid: true })).toMatchObject({ B: 0, M: 1630000 }));
  const confirmed: LedgerPayment = { ...saysPaid, status: 'confirmed' };
  it('confirmed payment counts', () => expect(computeBalances(P, X, [confirmed])).toMatchObject({ B: 0, M: 1630000 }));
  it('ignorePayments skips payments', () => expect(computeBalances(P, X, [confirmed], { ignorePayments: true })).toMatchObject({ M: 2195000 }));
  it('disabled and rejected payments never count', () => {
    const off: LedgerPayment[] = [{ ...confirmed, status: 'disabled' }, { ...confirmed, id: 'p2', status: 'rejected' }];
    expect(computeBalances(P, X, off, { includeSaysPaid: true })).toMatchObject({ B: -565000, M: 2195000 });
  });
  it('lists every person even with no activity', () => expect(computeBalances(['M', 'Z'], [], [])).toEqual({ M: 0, Z: 0 }));
});
