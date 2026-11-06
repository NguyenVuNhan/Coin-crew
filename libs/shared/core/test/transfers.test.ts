import { describe, it, expect } from 'vitest';
import { computeBalances, type Balances } from '../src/balances';
import { suggestTransfers, pairwiseTransfers, type Transfer } from '../src/transfers';
import { P, X } from './fixtures';

const byKey = (ts: Transfer[]) => [...ts].sort((x, y) => (x.fromId + x.toId).localeCompare(y.fromId + y.toId));

describe('suggestTransfers', () => {
  it('mockup trip, fewest transfers', () =>
    expect(byKey(suggestTransfers(computeBalances(P, X, []), P))).toEqual(byKey([
      { fromId: 'C', toId: 'M', amount: 1245000 }, { fromId: 'B', toId: 'M', amount: 565000 }, { fromId: 'A', toId: 'M', amount: 385000 },
    ])));

  const tie: Balances = { M: 150, A: 150, B: -150, C: -150 };
  it('greedy ties go to earlier people', () =>
    expect(suggestTransfers(tie, P)).toEqual([{ fromId: 'B', toId: 'M', amount: 150 }, { fromId: 'C', toId: 'A', amount: 150 }]));
  it('keeps previous pairs that still balance', () =>
    expect(suggestTransfers(tie, P, [{ fromId: 'B', toId: 'A', amount: 150 }, { fromId: 'C', toId: 'M', amount: 150 }]))
      .toEqual([{ fromId: 'B', toId: 'A', amount: 150 }, { fromId: 'C', toId: 'M', amount: 150 }]));
  it('settled trip suggests nothing', () => expect(suggestTransfers({ M: 0, A: 0 }, ['M', 'A'])).toEqual([]));

  it('zeroes every balance (100 seeded random trips)', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 100; i++) {
      const n = 2 + Math.floor(rnd() * 7);
      const order = Array.from({ length: n }, (_, k) => `p${k}`);
      const balances: Balances = {};
      let sum = 0;
      order.slice(1).forEach((id) => { const v = Math.floor(rnd() * 2_000_000) - 1_000_000; balances[id] = v; sum += v; });
      balances[order[0]!] = -sum;
      const previous = i % 2 ? suggestTransfers(balances, [...order].reverse()) : undefined;
      const ts = suggestTransfers(balances, order, previous);
      const left = { ...balances };
      for (const t of ts) {
        expect(t.amount).toBeGreaterThan(0);
        left[t.fromId]! += t.amount;
        left[t.toId]! -= t.amount;
      }
      expect(Object.values(left).every((v) => v === 0), `case ${i}`).toBe(true);
    }
  });
});

describe('pairwiseTransfers', () => {
  it('mockup trip, debts per pair', () =>
    expect(byKey(pairwiseTransfers(P, X, []))).toEqual(byKey([
      { fromId: 'A', toId: 'M', amount: 665000 }, { fromId: 'B', toId: 'M', amount: 650000 }, { fromId: 'C', toId: 'M', amount: 880000 },
      { fromId: 'B', toId: 'A', amount: 65000 }, { fromId: 'C', toId: 'A', amount: 215000 }, { fromId: 'C', toId: 'B', amount: 150000 },
    ])));
  it('payments (confirmed and says_paid) reduce the pair', () => {
    const ts = pairwiseTransfers(P, X, [
      { id: 'p1', fromId: 'C', toId: 'M', amount: 880000, status: 'confirmed' },
      { id: 'p2', fromId: 'A', toId: 'M', amount: 65000, status: 'says_paid' },
      { id: 'p3', fromId: 'B', toId: 'M', amount: 650000, status: 'disabled' },
    ]);
    expect(ts.find((t) => t.fromId === 'C' && t.toId === 'M')).toBeUndefined();
    expect(ts.find((t) => t.fromId === 'A' && t.toId === 'M')?.amount).toBe(600000);
    expect(ts.find((t) => t.fromId === 'B' && t.toId === 'M')?.amount).toBe(650000);
  });
});
