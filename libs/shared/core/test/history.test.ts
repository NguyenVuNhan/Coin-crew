import { describe, it, expect } from 'vitest';
import { pairHistory, type PairHistoryInput } from '../src/history';
import type { ExpenseSportMeta, ExpenseView, PaymentView } from '../src/api-types';
import type { Transfer } from '../src/transfers';

let seq = 0;
function stamp(): string {
  seq += 1;
  return `2026-11-${String(seq).padStart(2, '0')}T10:00:00.000Z`;
}

function expense(payerId: string, amount: number, shares: Record<string, number>, over: Partial<ExpenseView> = {}): ExpenseView {
  const createdAt = over.createdAt ?? stamp();
  return {
    id: `e${seq}`,
    description: 'Lunch',
    amount,
    spentOn: createdAt.slice(0, 10),
    payerId,
    mode: 'amounts',
    status: 'approved',
    rejectReason: null,
    disabledByName: null,
    createdById: payerId,
    createdAt,
    shares: Object.entries(shares).map(([participantId, a]) => ({ participantId, amount: a, inputValue: a })),
    meta: null,
    ...over,
  };
}

function payment(fromId: string, toId: string, amount: number, over: Partial<PaymentView> = {}): PaymentView {
  const createdAt = over.createdAt ?? stamp();
  return {
    id: `p${seq}`,
    fromId,
    toId,
    amountClaimed: amount,
    amountConfirmed: amount,
    status: 'confirmed',
    notArrived: false,
    createdAt,
    disabledByName: null,
    ...over,
  };
}

function run(expenses: ExpenseView[], payments: PaymentView[] = [], suggestions?: Transfer[], roundTransfers = false) {
  const input: PairHistoryInput = {
    tripId: 't1',
    ownerPid: 'o',
    otherPid: 'a',
    expenses,
    payments,
    suggestions: suggestions ?? [],
    roundTransfers,
  };
  if (suggestions === undefined) {
    // Default: suggestions agree with the two-way sum (pairwise group).
    const probe = pairHistory(input);
    input.suggestions =
      probe.twoWay > 0
        ? [{ fromId: 'a', toId: 'o', amount: probe.twoWay }]
        : probe.twoWay < 0
          ? [{ fromId: 'o', toId: 'a', amount: -probe.twoWay }]
          : [];
  }
  return pairHistory(input);
}

describe('pairHistory', () => {
  it('owner paid lunch 240.000 split o/a 120/120 → one line effect +120000, twoWay 120000', () => {
    const h = run([expense('o', 240000, { o: 120000, a: 120000 })]);
    expect(h.lines).toHaveLength(1);
    expect(h.lines[0]).toMatchObject({
      kind: 'expense', tripId: 't1', title: 'Lunch', amount: 240000, paidBy: 'owner',
      ownerShare: 120000, otherShare: 120000, effect: 120000, state: 'counted',
    });
    expect(h.twoWay).toBe(120000);
    expect(h.gap).toBeNull();
  });

  it('other paid, only owner has a share 50.000 → effect −50000', () => {
    const h = run([expense('a', 50000, { o: 50000 })]);
    expect(h.lines).toHaveLength(1);
    expect(h.lines[0]).toMatchObject({ paidBy: 'other', ownerShare: 50000, otherShare: 0, effect: -50000 });
    expect(h.twoWay).toBe(-50000);
  });

  it('owner paid but only the owner has a share → no line', () => {
    const h = run([expense('o', 50000, { o: 50000 })]);
    expect(h.lines).toEqual([]);
  });

  it('third person paid with both sharing → no line', () => {
    const h = run([expense('b', 300000, { o: 100000, a: 100000, b: 100000 })]);
    expect(h.lines).toEqual([]);
    expect(h.twoWay).toBe(0);
  });

  it('fund-paid and planning expenses never appear', () => {
    const h = run([
      expense('o', 100000, { o: 50000, a: 50000 }, { meta: { paidFromFund: true } }),
      expense('o', 100000, { o: 50000, a: 50000 }, { meta: { sport: { planning: true } as ExpenseSportMeta } }),
    ]);
    expect(h.lines).toEqual([]);
    expect(h.twoWay).toBe(0);
  });

  it('says_paid payment a→o 100.000 → state waiting, effect −100000, counted in twoWay', () => {
    const h = run([expense('o', 400000, { o: 200000, a: 200000 })], [payment('a', 'o', 100000, { status: 'says_paid', amountConfirmed: null })]);
    const p = h.lines.find((l) => l.kind === 'payment')!;
    expect(p).toMatchObject({ state: 'waiting', effect: -100000, amount: 100000, paidBy: 'other', title: null, ownerShare: 0, otherShare: 0 });
    expect(p.date).toBe(p.createdAt.slice(0, 10));
    expect(h.twoWay).toBe(100000);
  });

  it('payment owner → other adds to what other owes', () => {
    const h = run([], [payment('o', 'a', 70000)]);
    expect(h.lines[0]).toMatchObject({ kind: 'payment', paidBy: 'owner', effect: 70000 });
    expect(h.twoWay).toBe(70000);
  });

  it('payments with a third person → no line', () => {
    const h = run([], [payment('a', 'b', 70000), payment('b', 'o', 20000)]);
    expect(h.lines).toEqual([]);
  });

  it('disabled expense → state disabled, not in twoWay', () => {
    const h = run([expense('o', 100000, { o: 50000, a: 50000 }, { status: 'disabled' })]);
    expect(h.lines).toHaveLength(1);
    expect(h.lines[0]!.state).toBe('disabled');
    expect(h.twoWay).toBe(0);
  });

  it('pending expense → state unapproved, not in twoWay', () => {
    const h = run([expense('o', 100000, { o: 50000, a: 50000 }, { status: 'pending' })]);
    expect(h.lines).toHaveLength(1);
    expect(h.lines[0]!.state).toBe('unapproved');
    expect(h.twoWay).toBe(0);
  });

  it('rejected expense and rejected payment → no line', () => {
    const h = run([expense('o', 100000, { o: 50000, a: 50000 }, { status: 'rejected' })], [payment('a', 'o', 50000, { status: 'rejected' })]);
    expect(h.lines).toEqual([]);
  });

  it('disabled payment → state disabled, not in twoWay', () => {
    const h = run([expense('o', 100000, { o: 50000, a: 50000 })], [payment('a', 'o', 50000, { status: 'disabled' })]);
    expect(h.lines.map((l) => l.state)).toEqual(['disabled', 'counted']);
    expect(h.twoWay).toBe(50000);
  });

  it('payment amount prefers amountConfirmed over amountClaimed', () => {
    const h = run([], [payment('a', 'o', 100000, { amountClaimed: 100000, amountConfirmed: 90000 })]);
    expect(h.lines[0]).toMatchObject({ amount: 90000, effect: -90000 });
  });

  it('trim: +100k, a pays 100k (confirmed), +30k → lines = [the +30k only], trimmed true', () => {
    const first = expense('o', 200000, { o: 100000, a: 100000 });
    const pay = payment('a', 'o', 100000);
    const last = expense('o', 60000, { o: 30000, a: 30000 });
    const h = run([first, last], [pay]);
    expect(h.lines.map((l) => l.id)).toEqual([last.id]);
    expect(h.trimmed).toBe(true);
    expect(h.twoWay).toBe(30000);
  });

  it('trim keeps non-counted lines after the cut and drops them before it', () => {
    const early = expense('o', 20000, { o: 10000, a: 10000 }, { status: 'pending' });
    const first = expense('o', 200000, { o: 100000, a: 100000 });
    const pay = payment('a', 'o', 100000);
    const off = expense('o', 20000, { o: 10000, a: 10000 }, { status: 'disabled' });
    const last = expense('o', 60000, { o: 30000, a: 30000 });
    const h = run([early, first, off, last], [pay]);
    expect(h.lines.map((l) => l.id)).toEqual([last.id, off.id]);
    expect(h.trimmed).toBe(true);
  });

  it('settled now (sum 0 at the end) → lines [] , trimmed true', () => {
    const h = run([expense('o', 200000, { o: 100000, a: 100000 })], [payment('a', 'o', 100000)]);
    expect(h.lines).toEqual([]);
    expect(h.trimmed).toBe(true);
    expect(h.twoWay).toBe(0);
    expect(h.gap).toBeNull();
  });

  it('never settled → nothing trimmed', () => {
    const h = run([expense('o', 200000, { o: 100000, a: 100000 }), expense('a', 40000, { o: 20000, a: 20000 })]);
    expect(h.lines).toHaveLength(2);
    expect(h.trimmed).toBe(false);
    expect(h.twoWay).toBe(80000);
  });

  it('pairwise, suggestions match → gap null', () => {
    const h = run([expense('o', 240000, { o: 120000, a: 120000 })], [], [{ fromId: 'a', toId: 'o', amount: 120000 }]);
    expect(h.suggested).toBe(120000);
    expect(h.gap).toBeNull();
  });

  it('suggested is negative when owner owes other', () => {
    const h = run([expense('a', 100000, { o: 50000, a: 50000 })], [], [{ fromId: 'o', toId: 'a', amount: 50000 }]);
    expect(h.suggested).toBe(-50000);
    expect(h.twoWay).toBe(-50000);
    expect(h.gap).toBeNull();
  });

  it("round_transfers: twoWay 120400, suggestion 120000 → gap {kind:'rounding'}", () => {
    const h = run([expense('o', 240800, { o: 120400, a: 120400 })], [], [{ fromId: 'a', toId: 'o', amount: 120000 }], true);
    expect(h.twoWay).toBe(120400);
    expect(h.suggested).toBe(120000);
    expect(h.gap).toEqual({ kind: 'rounding' });
  });

  it('a small difference without round_transfers is a reroute', () => {
    const h = run([expense('o', 240800, { o: 120400, a: 120400 })], [], [{ fromId: 'a', toId: 'o', amount: 120000 }], false);
    expect(h.gap).toEqual({ kind: 'reroute', difference: -400, viaPid: null });
  });

  it("fewest transfers: twoWay 300000, suggestions a→o 210000 and a→b 90000 → gap {kind:'reroute', difference:-90000, viaPid:'b'}, no trim", () => {
    const first = expense('o', 400000, { o: 200000, a: 200000 });
    const pay = payment('a', 'o', 200000);
    const last = expense('o', 600000, { o: 300000, a: 300000 });
    const h = run([first, last], [pay], [
      { fromId: 'a', toId: 'o', amount: 210000 },
      { fromId: 'a', toId: 'b', amount: 90000 },
    ]);
    expect(h.twoWay).toBe(300000);
    expect(h.suggested).toBe(210000);
    expect(h.gap).toEqual({ kind: 'reroute', difference: -90000, viaPid: 'b' });
    expect(h.trimmed).toBe(false);
    expect(h.lines).toHaveLength(3);
  });

  it('reroute with twoWay 0 and suggested 50000 → lines kept (no trim), gap reroute, viaPid null when no single matching transfer', () => {
    const h = run([expense('o', 200000, { o: 100000, a: 100000 })], [payment('a', 'o', 100000)], [
      { fromId: 'a', toId: 'o', amount: 50000 },
      { fromId: 'b', toId: 'a', amount: 30000 },
      { fromId: 'b', toId: 'a', amount: 20000 },
    ]);
    expect(h.twoWay).toBe(0);
    expect(h.suggested).toBe(50000);
    expect(h.gap).toEqual({ kind: 'reroute', difference: 50000, viaPid: null });
    expect(h.trimmed).toBe(false);
    expect(h.lines).toHaveLength(2);
  });

  it('reroute with no lines at all does not crash', () => {
    const h = pairHistory({
      tripId: 't1', ownerPid: 'o', otherPid: 'a', expenses: [], payments: [],
      suggestions: [{ fromId: 'a', toId: 'o', amount: 50000 }], roundTransfers: false,
    });
    expect(h).toEqual({ lines: [], twoWay: 0, suggested: 50000, gap: { kind: 'reroute', difference: 50000, viaPid: null }, trimmed: false });
  });

  it('lines are newest first', () => {
    const e1 = expense('o', 100000, { o: 50000, a: 50000 });
    const p1 = payment('a', 'o', 10000);
    const e2 = expense('a', 100000, { o: 50000, a: 50000 });
    const h = run([e2, e1], [p1]);
    expect(h.lines.map((l) => l.id)).toEqual([e2.id, p1.id, e1.id]);
    expect(h.lines[0]!.date).toBe(e2.spentOn);
  });
});
