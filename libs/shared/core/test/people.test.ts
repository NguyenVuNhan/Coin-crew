import { describe, it, expect } from 'vitest';
import {
  pairItems,
  spreadSettlement,
  type PersonItem,
  type TripPairInput,
} from '../src/people';

describe('pairItems', () => {
  it('computes amounts from suggestions and drops trips with no pair transfers', () => {
    const inputs: TripPairInput[] = [
      {
        tripId: 't1',
        tripName: 'Trip 1',
        kind: 'group',
        ownerPid: 'o',
        otherPid: 'm',
        suggestions: [{ fromId: 'm', toId: 'o', amount: 200 }],
        oldestOpenAt: '2026-10-01T00:00:00Z',
        writable: true,
      },
      {
        tripId: 't2',
        tripName: 'Trip 2',
        kind: 'group',
        ownerPid: 'o',
        otherPid: 'm',
        suggestions: [{ fromId: 'o', toId: 'm', amount: 50 }],
        oldestOpenAt: '2026-10-02T00:00:00Z',
        writable: true,
      },
      {
        tripId: 't3',
        tripName: 'Trip 3',
        kind: 'group',
        ownerPid: 'o',
        otherPid: 'm',
        suggestions: [{ fromId: 'm', toId: 'x', amount: 100 }],
        oldestOpenAt: '2026-10-03T00:00:00Z',
        writable: true,
      },
    ];

    expect(pairItems(inputs)).toEqual([
      {
        tripId: 't1',
        tripName: 'Trip 1',
        kind: 'group',
        amount: 200,
        oldestOpenAt: '2026-10-01T00:00:00Z',
      },
      {
        tripId: 't2',
        tripName: 'Trip 2',
        kind: 'group',
        amount: -50,
        oldestOpenAt: '2026-10-02T00:00:00Z',
      },
    ]);
  });
});

describe('spreadSettlement', () => {
  const items: (PersonItem & { writable: boolean })[] = [
    {
      tripId: 'D',
      tripName: 'Direct',
      kind: 'direct',
      amount: 120,
      oldestOpenAt: '2026-10-01T00:00:00Z',
      writable: true,
    },
    {
      tripId: 'group',
      tripName: 'Group',
      kind: 'group',
      amount: 200,
      oldestOpenAt: '2026-10-02T00:00:00Z',
      writable: true,
    },
    {
      tripId: 'group2',
      tripName: 'Group 2',
      kind: 'group',
      amount: -50,
      oldestOpenAt: '2026-10-03T00:00:00Z',
      writable: true,
    },
  ];

  it('spreads exact settlement: net 270 settled fully', () => {
    const parts = spreadSettlement(items, 270, 'toOwner', 'D');
    expect(parts).toEqual([
      { tripId: 'D', fromOwner: false, amount: 120 },
      { tripId: 'group', fromOwner: false, amount: 200 },
      { tripId: 'group2', fromOwner: true, amount: 50 },
    ]);
    const signedSum = parts.reduce(
      (sum, p) => sum + (p.fromOwner ? -p.amount : p.amount),
      0,
    );
    expect(signedSum).toBe(270);
  });

  it('spreads partial settlement: paid=170 settles -50 fully, +120 fully, +200 gets 100', () => {
    const parts = spreadSettlement(items, 170, 'toOwner', 'D');
    expect(parts).toEqual([
      { tripId: 'D', fromOwner: false, amount: 120 },
      { tripId: 'group', fromOwner: false, amount: 100 },
      { tripId: 'group2', fromOwner: true, amount: 50 },
    ]);
    const signedSum = parts.reduce(
      (sum, p) => sum + (p.fromOwner ? -p.amount : p.amount),
      0,
    );
    expect(signedSum).toBe(170);
  });

  it('spreads overpay: paid=300 adds leftover to D part', () => {
    const parts = spreadSettlement(items, 300, 'toOwner', 'D');
    expect(parts).toEqual([
      { tripId: 'D', fromOwner: false, amount: 150 },
      { tripId: 'group', fromOwner: false, amount: 200 },
      { tripId: 'group2', fromOwner: true, amount: 50 },
    ]);
    const signedSum = parts.reduce(
      (sum, p) => sum + (p.fromOwner ? -p.amount : p.amount),
      0,
    );
    expect(signedSum).toBe(300);
  });

  it('redirects non-writable item onto directTripId part and merges', () => {
    const nonWritableItems = [
      items[0]!,
      { ...items[1]!, writable: false },
      items[2]!,
    ];
    const parts = spreadSettlement(nonWritableItems, 270, 'toOwner', 'D');
    expect(parts).toEqual([
      { tripId: 'D', fromOwner: false, amount: 320 },
      { tripId: 'group2', fromOwner: true, amount: 50 },
    ]);
    expect(parts.find((p) => p.tripId === 'group')).toBeUndefined();
    const signedSum = parts.reduce(
      (sum, p) => sum + (p.fromOwner ? -p.amount : p.amount),
      0,
    );
    expect(signedSum).toBe(270);
  });

  it('spreads settlement with direction fromOwner mirroring signs', () => {
    const fromOwnerItems: (PersonItem & { writable: boolean })[] = [
      {
        tripId: 'D',
        tripName: 'Direct',
        kind: 'direct',
        amount: -120,
        oldestOpenAt: '2026-10-01T00:00:00Z',
        writable: true,
      },
      {
        tripId: 'group',
        tripName: 'Group',
        kind: 'group',
        amount: -200,
        oldestOpenAt: '2026-10-02T00:00:00Z',
        writable: true,
      },
      {
        tripId: 'group2',
        tripName: 'Group 2',
        kind: 'group',
        amount: 50,
        oldestOpenAt: '2026-10-03T00:00:00Z',
        writable: true,
      },
    ];
    const parts = spreadSettlement(fromOwnerItems, 270, 'fromOwner', 'D');
    expect(parts).toEqual([
      { tripId: 'D', fromOwner: true, amount: 120 },
      { tripId: 'group', fromOwner: true, amount: 200 },
      { tripId: 'group2', fromOwner: false, amount: 50 },
    ]);
  });
});
