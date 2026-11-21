import { describe, it, expect } from 'vitest';
import { compareRecentRows, type BookRow, type GroupRow } from '../src/groupShares';
import type { EntryView, PersonRow } from '../src/api-types';

let seq = 1;

function makeGroupRow(overrides: Partial<GroupRow> = {}): GroupRow {
  const id = overrides.id ?? `g-${seq++}`;
  const createdAt = overrides.createdAt ?? '2026-11-10T12:00:00.000Z';
  return {
    kind: 'group',
    id,
    rootId: overrides.rootId ?? id,
    tripId: 'trip-1',
    tripName: 'Đà Lạt',
    isDirect: false,
    source: 'expense',
    date: '2026-11-10',
    title: 'Dinner',
    total: 300_000,
    myShare: 100_000,
    iPaid: false,
    payerName: 'Hùng',
    counterpartName: null,
    people: ['Lan'],
    pending: false,
    link: null,
    createdAt,
    activityAt: overrides.activityAt ?? createdAt,
    ...overrides,
  };
}

function makeEntryRow(overrides: Partial<EntryView> = {}): BookRow {
  const id = overrides.id ?? `e-${seq++}`;
  return {
    kind: 'entry',
    entry: {
      id,
      walletId: 'w-1',
      type: 'expense',
      amount: 50_000,
      currency: 'VND',
      categoryId: 'cat-1',
      assetId: null,
      date: '2026-11-10',
      time: null,
      note: 'Phở',
      tags: [],
      transferId: null,
      counterpartWalletId: null,
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-10T08:00:00.000Z',
      ...overrides,
    },
  };
}

function makePersonRow(overrides: Partial<PersonRow> = {}): PersonRow {
  const id = overrides.id ?? `p-${seq++}`;
  return {
    kind: 'person',
    id,
    tripId: 'trip-1',
    date: '2026-11-10',
    share: 100_000,
    total: 200_000,
    note: 'Coffee',
    people: ['An'],
    walletId: 'w-1',
    currency: 'VND',
    createdAt: '2026-11-10T09:00:00.000Z',
    ...overrides,
  };
}

describe('compareRecentRows', () => {
  it('places a confirmed payment with an old date but new activityAt first', () => {
    const oldConfirmedPayment = makeGroupRow({
      id: 'g-pay',
      source: 'payment',
      date: '2026-10-05',
      createdAt: '2026-10-05T10:00:00.000Z',
      activityAt: '2026-11-21T15:00:00.000Z',
    });
    const newerDatedEntry = makeEntryRow({
      id: 'e-today',
      date: '2026-11-20',
      createdAt: '2026-11-20T09:00:00.000Z',
    });
    const newerDatedGroup = makeGroupRow({
      id: 'g-expense',
      date: '2026-11-19',
      createdAt: '2026-11-19T12:00:00.000Z',
      activityAt: '2026-11-19T12:00:00.000Z',
    });

    const sorted = [newerDatedGroup, newerDatedEntry, oldConfirmedPayment].sort(compareRecentRows);
    expect(sorted.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([
      'g-pay',
      'e-today',
      'g-expense',
    ]);
  });

  it('places an entry dated last month but created now first', () => {
    const backdatedEntry = makeEntryRow({
      id: 'e-backdated',
      date: '2026-10-12',
      createdAt: '2026-11-21T16:00:00.000Z',
    });
    const currentEntry = makeEntryRow({
      id: 'e-current',
      date: '2026-11-21',
      createdAt: '2026-11-21T10:00:00.000Z',
    });
    const personRow = makePersonRow({
      id: 'p-1',
      date: '2026-11-21',
      createdAt: '2026-11-21T12:00:00.000Z',
    });

    const sorted = [currentEntry, personRow, backdatedEntry].sort(compareRecentRows);
    expect(sorted.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([
      'e-backdated',
      'p-1',
      'e-current',
    ]);
  });

  it('breaks ties deterministically by id ascending regardless of input order', () => {
    const ts = '2026-11-21T14:00:00.000Z';
    const rowA = makeEntryRow({ id: 'a-id', date: '2026-11-01', createdAt: ts });
    const rowB = makeGroupRow({ id: 'b-id', date: '2026-11-20', createdAt: '2026-11-01T00:00:00.000Z', activityAt: ts });
    const rowC = makePersonRow({ id: 'c-id', date: '2026-11-15', createdAt: ts });

    const order1 = [rowC, rowA, rowB].sort(compareRecentRows);
    const order2 = [rowB, rowC, rowA].sort(compareRecentRows);

    expect(order1.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([
      'a-id',
      'b-id',
      'c-id',
    ]);
    expect(order2.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([
      'a-id',
      'b-id',
      'c-id',
    ]);
  });
});
