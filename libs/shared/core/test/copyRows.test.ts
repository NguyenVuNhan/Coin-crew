import { describe, it, expect } from 'vitest';
import {
  listFromCopy,
  type CategoryView,
  type CopyLookups,
  type SyncEntryRow,
  type SyncLedgerRow,
  type TagView,
  type WalletDetailView,
} from '../src/index';

function makeWallet(overrides: Partial<WalletDetailView> = {}): WalletDetailView {
  return {
    id: 'w1',
    name: 'Cash',
    currency: 'VND',
    balance: 1_000_000,
    isDefault: false,
    kind: 'everyday',
    startAmount: 1_000_000,
    startDate: '2026-11-01',
    startCostVnd: null,
    vndValue: 1_000_000,
    icon: null,
    sortOrder: 0,
    archived: false,
    entryCount: 0,
    ...overrides,
  };
}

function makeEntryRow(overrides: Partial<SyncEntryRow> = {}): SyncEntryRow {
  return {
    id: 'e1',
    walletId: 'w1',
    type: 'expense',
    amount: 50_000,
    categoryId: 'c1',
    assetId: null,
    quantity: null,
    transferId: null,
    counterpartWalletId: null,
    date: '2026-11-10',
    time: '12:00',
    note: 'Lunch',
    tagIds: [],
    excludeFromReports: false,
    createdAt: '2026-11-10T12:00:00.000Z',
    syncVersion: 1,
    ...overrides,
  };
}

function makeLedgerRow(overrides: Partial<SyncLedgerRow> = {}): SyncLedgerRow {
  return {
    id: 'p1',
    tripId: 't1',
    date: '2026-11-10',
    share: 40_000,
    total: 80_000,
    note: 'Shared dinner',
    people: ['Lan'],
    createdAt: '2026-11-10T19:00:00.000Z',
    ...overrides,
  };
}

function makeCategory(overrides: Partial<CategoryView> = {}): CategoryView {
  return {
    id: 'c1',
    parentId: null,
    type: 'expense',
    name: 'Food',
    icon: 'utensils',
    hidden: false,
    sortOrder: 0,
    ...overrides,
  };
}

function makeTag(overrides: Partial<TagView> = {}): TagView {
  return {
    id: 'tag1',
    name: 'Work',
    useCount: 1,
    ...overrides,
  };
}

describe('listFromCopy', () => {
  it('fills currency, beforeStart and tag names', () => {
    const lookups: CopyLookups = {
      wallets: [makeWallet({ id: 'w-usd', currency: 'USD', startDate: '2026-11-05' })],
      categories: [],
      tags: [
        makeTag({ id: 't1', name: 'Travel' }),
        makeTag({ id: 't2', name: 'Meal' }),
      ],
    };

    const rows = listFromCopy(
      {
        entries: [
          makeEntryRow({
            id: 'e-before',
            walletId: 'w-usd',
            date: '2026-11-03',
            assetId: 'a1',
            quantity: 2,
            tagIds: ['t2', 'missing-tag', 't1'],
            syncVersion: 7,
          }),
        ],
        ledger: [],
      },
      { month: '2026-11' },
      lookups,
      '2026-11-19',
    );

    expect(rows).toEqual([
      {
        kind: 'entry',
        entry: {
          id: 'e-before',
          walletId: 'w-usd',
          type: 'expense',
          amount: 50_000,
          currency: 'USD',
          categoryId: 'c1',
          assetId: 'a1',
          quantity: 2,
          transferId: null,
          counterpartWalletId: null,
          date: '2026-11-03',
          time: '12:00',
          note: 'Lunch',
          tags: ['Meal', 'Travel'],
          excludeFromReports: false,
          source: 'manual',
          beforeStart: true,
          createdAt: '2026-11-10T12:00:00.000Z',
        },
      },
    ]);
  });

  it('drops entries whose wallet is unknown', () => {
    const lookups: CopyLookups = {
      wallets: [makeWallet({ id: 'w-known' })],
      categories: [],
      tags: [],
    };

    const rows = listFromCopy(
      {
        entries: [
          makeEntryRow({ id: 'e-known', walletId: 'w-known' }),
          makeEntryRow({ id: 'e-unknown', walletId: 'w-missing' }),
        ],
        ledger: [],
      },
      { month: '2026-11' },
      lookups,
      '2026-11-19',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'entry', entry: { id: 'e-known' } });
  });

  it('person rows take the default wallet', () => {
    const lookups: CopyLookups = {
      wallets: [
        makeWallet({ id: 'w-other', isDefault: false }),
        makeWallet({ id: 'w-default', isDefault: true, currency: 'VND' }),
      ],
      categories: [],
      tags: [],
    };

    const rows = listFromCopy(
      {
        entries: [],
        ledger: [makeLedgerRow({ id: 'p1', date: '2026-11-12' })],
      },
      { month: '2026-11' },
      lookups,
      '2026-11-19',
    );

    expect(rows).toEqual([
      {
        kind: 'person',
        id: 'p1',
        tripId: 't1',
        date: '2026-11-12',
        share: 40_000,
        total: 80_000,
        note: 'Shared dinner',
        people: ['Lan'],
        walletId: 'w-default',
        currency: 'VND',
        createdAt: '2026-11-10T19:00:00.000Z',
      },
    ]);
  });

  it('no default wallet -> no person rows', () => {
    const lookups: CopyLookups = {
      wallets: [makeWallet({ id: 'w1', isDefault: false })],
      categories: [],
      tags: [],
    };

    const rows = listFromCopy(
      {
        entries: [makeEntryRow({ id: 'e1', walletId: 'w1' })],
        ledger: [makeLedgerRow({ id: 'p1' })],
      },
      { month: '2026-11' },
      lookups,
      '2026-11-19',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('entry');
  });

  it('month filter keeps only that month', () => {
    const lookups: CopyLookups = {
      wallets: [makeWallet({ id: 'w1', isDefault: true })],
      categories: [],
      tags: [],
    };

    const rows = listFromCopy(
      {
        entries: [
          makeEntryRow({ id: 'e-oct', date: '2026-10-31' }),
          makeEntryRow({ id: 'e-nov', date: '2026-11-15' }),
          makeEntryRow({ id: 'e-dec', date: '2026-12-01' }),
        ],
        ledger: [
          makeLedgerRow({ id: 'p-oct', date: '2026-10-20' }),
          makeLedgerRow({ id: 'p-nov', date: '2026-11-20' }),
        ],
      },
      { month: '2026-11' },
      lookups,
      '2026-12-05',
    );

    expect(rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual(['p-nov', 'e-nov']);
  });

  it('tag filter matches by id', () => {
    const lookups: CopyLookups = {
      wallets: [makeWallet({ id: 'w1', isDefault: true })],
      categories: [],
      tags: [
        makeTag({ id: 't-food', name: 'Food' }),
        makeTag({ id: 't-work', name: 'Work' }),
      ],
    };

    const rows = listFromCopy(
      {
        entries: [
          makeEntryRow({ id: 'e1', tagIds: ['t-food'] }),
          makeEntryRow({ id: 'e2', tagIds: ['t-work'] }),
        ],
        ledger: [makeLedgerRow({ id: 'p1' })],
      },
      { month: '2026-11', tagId: 't-work' },
      lookups,
      '2026-11-19',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'entry', entry: { id: 'e2', tags: ['Work'] } });
  });

  it('category filter includes sub-categories', () => {
    const lookups: CopyLookups = {
      wallets: [makeWallet({ id: 'w1', isDefault: true })],
      categories: [
        makeCategory({ id: 'c-parent', parentId: null }),
        makeCategory({ id: 'c-child', parentId: 'c-parent' }),
        makeCategory({ id: 'c-other', parentId: null }),
      ],
      tags: [],
    };

    const rows = listFromCopy(
      {
        entries: [
          makeEntryRow({ id: 'e-parent', categoryId: 'c-parent', date: '2026-11-12' }),
          makeEntryRow({ id: 'e-child', categoryId: 'c-child', date: '2026-11-11' }),
          makeEntryRow({ id: 'e-other', categoryId: 'c-other', date: '2026-11-10' }),
        ],
        ledger: [makeLedgerRow({ id: 'p1' })],
      },
      { month: '2026-11', categoryId: 'c-parent' },
      lookups,
      '2026-11-19',
    );

    expect(rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([
      'e-parent',
      'e-child',
    ]);
  });

  it('sorted like the server (date desc, time desc with null last, createdAt desc)', () => {
    const lookups: CopyLookups = {
      wallets: [makeWallet({ id: 'w1', isDefault: true })],
      categories: [],
      tags: [],
    };

    const rows = listFromCopy(
      {
        entries: [
          makeEntryRow({
            id: 'e-null-older',
            date: '2026-11-10',
            time: null,
            createdAt: '2026-11-10T01:00:00.000Z',
          }),
          makeEntryRow({
            id: 'e-0900',
            date: '2026-11-10',
            time: '09:00',
            createdAt: '2026-11-10T02:00:00.000Z',
          }),
          makeEntryRow({
            id: 'e-1400',
            date: '2026-11-10',
            time: '14:00',
            createdAt: '2026-11-10T03:00:00.000Z',
          }),
          makeEntryRow({
            id: 'e-later-date',
            date: '2026-11-15',
            time: '08:00',
            createdAt: '2026-11-15T08:00:00.000Z',
          }),
        ],
        ledger: [
          makeLedgerRow({
            id: 'p-null-newer',
            date: '2026-11-10',
            createdAt: '2026-11-10T10:00:00.000Z',
          }),
        ],
      },
      { month: '2026-11' },
      lookups,
      '2026-11-19',
    );

    expect(rows.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([
      'e-later-date',
      'e-1400',
      'e-0900',
      'p-null-newer',
      'e-null-older',
    ]);
  });
});
