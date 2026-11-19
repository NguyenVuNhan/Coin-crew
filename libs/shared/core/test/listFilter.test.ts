import { describe, it, expect } from 'vitest';
import {
  foldForSearch,
  matchesNote,
  monthBounds,
  resolveListPeriod,
  compareListRows,
  matchesListQuery,
  type EntryView,
  type PersonRow,
  type ListRow,
} from '../src/index';

function makeEntry(overrides: Partial<EntryView> = {}): ListRow {
  return {
    kind: 'entry',
    entry: {
      id: 'e1',
      walletId: 'w1',
      type: 'expense',
      amount: 10_000,
      currency: 'VND',
      categoryId: 'c1',
      assetId: null,
      quantity: null,
      transferId: null,
      counterpartWalletId: null,
      date: '2026-11-10',
      time: '12:00',
      note: 'Coffee',
      tags: [],
      excludeFromReports: false,
      source: 'manual',
      beforeStart: false,
      createdAt: '2026-11-10T12:00:00.000Z',
      ...overrides,
    },
  };
}

function makePerson(overrides: Partial<PersonRow> = {}): ListRow {
  return {
    kind: 'person',
    id: 'p1',
    tripId: 't1',
    date: '2026-11-10',
    share: 50_000,
    total: 100_000,
    note: 'Team lunch',
    people: ['Lan'],
    walletId: 'w-default',
    currency: 'VND',
    createdAt: '2026-11-10T12:00:00.000Z',
    ...overrides,
  };
}

const baseCtx = {
  period: { from: '2026-11-01', to: '2026-11-30' },
  tagIdsOf: (id: string) => (id === 'e-tagged' ? ['t-food'] : []),
  categoryParentOf: (id: string) => (id === 'c-child' ? 'c-parent' : null),
  defaultWalletId: 'w-default',
};

describe('listFilter pure functions', () => {
  it('foldForSearch folds accents, maps đ/Đ to d, lower-cases, and keeps whitespace', () => {
    expect(foldForSearch('Cà Phê Đá')).toBe('ca phe da');
    expect(foldForSearch('  Đà  Nẵng  ')).toBe('  da  nang  ');
  });

  it('matchesNote matches search query ignoring accents and casing', () => {
    expect(matchesNote('Cà phê sữa', 'ca phe')).toBe(true);
    expect(matchesNote(null, '')).toBe(true);
    expect(matchesNote('trà', 'ca')).toBe(false);
    expect(matchesNote(undefined, '   ')).toBe(true);
    expect(matchesNote(null, 'ca')).toBe(false);
  });

  it('monthBounds returns period bounds or null', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthBounds('2026-13')).toBeNull();
    expect(monthBounds('bad-format')).toBeNull();
  });

  it('resolveListPeriod fills missing bounds', () => {
    expect(resolveListPeriod({ to: '2026-11-19' }, '2026-12-01')).toEqual({
      from: '2026-11-01',
      to: '2026-11-19',
    });
    expect(resolveListPeriod({ from: '2026-11-05' }, '2026-11-19')).toEqual({
      from: '2026-11-05',
      to: '2026-11-19',
    });
    expect(resolveListPeriod({ month: '2026-02' }, '2026-12-01')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(resolveListPeriod({ month: '2026-13' }, '2026-11-19')).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
  });

  it('compareListRows sorts [same date null time, same date 09:00, later date] into later date, 09:00, null', () => {
    const rNullTime = makeEntry({ date: '2026-11-10', time: null, createdAt: '2026-11-10T01:00:00Z' });
    const r0900 = makeEntry({ date: '2026-11-10', time: '09:00', createdAt: '2026-11-10T02:00:00Z' });
    const rLater = makeEntry({ date: '2026-11-15', time: '08:00', createdAt: '2026-11-15T01:00:00Z' });

    const sorted = [rNullTime, r0900, rLater].sort(compareListRows);
    expect(sorted).toEqual([rLater, r0900, rNullTime]);
  });

  describe('matchesListQuery rules', () => {
    it('applies date within period.from..period.to inclusive', () => {
      const eFrom = makeEntry({ date: '2026-11-01' });
      const eTo = makeEntry({ date: '2026-11-30' });
      const eBefore = makeEntry({ date: '2026-10-31' });
      const eAfter = makeEntry({ date: '2026-12-01' });
      const pOutside = makePerson({ date: '2026-10-31' });

      expect(matchesListQuery(eFrom, {}, baseCtx)).toBe(true);
      expect(matchesListQuery(eTo, {}, baseCtx)).toBe(true);
      expect(matchesListQuery(eBefore, {}, baseCtx)).toBe(false);
      expect(matchesListQuery(eAfter, {}, baseCtx)).toBe(false);
      expect(matchesListQuery(pOutside, {}, baseCtx)).toBe(false);
    });

    it('entry rows: type person excludes all entries', () => {
      const entry = makeEntry({ type: 'expense' });
      expect(matchesListQuery(entry, { type: 'person' }, baseCtx)).toBe(false);
    });

    it('entry rows: type expense/income exact matching', () => {
      const exp = makeEntry({ type: 'expense' });
      const inc = makeEntry({ type: 'income' });

      expect(matchesListQuery(exp, { type: 'expense' }, baseCtx)).toBe(true);
      expect(matchesListQuery(inc, { type: 'expense' }, baseCtx)).toBe(false);

      expect(matchesListQuery(inc, { type: 'income' }, baseCtx)).toBe(true);
      expect(matchesListQuery(exp, { type: 'income' }, baseCtx)).toBe(false);
    });

    it('entry rows: type transfer matches transfer_out or transfer_in', () => {
      const tOut = makeEntry({ type: 'transfer_out' });
      const tIn = makeEntry({ type: 'transfer_in' });
      const exp = makeEntry({ type: 'expense' });

      expect(matchesListQuery(tOut, { type: 'transfer' }, baseCtx)).toBe(true);
      expect(matchesListQuery(tIn, { type: 'transfer' }, baseCtx)).toBe(true);
      expect(matchesListQuery(exp, { type: 'transfer' }, baseCtx)).toBe(false);
    });

    it('entry rows: type trade matches buy or sell', () => {
      const buy = makeEntry({ type: 'buy' });
      const sell = makeEntry({ type: 'sell' });
      const exp = makeEntry({ type: 'expense' });

      expect(matchesListQuery(buy, { type: 'trade' }, baseCtx)).toBe(true);
      expect(matchesListQuery(sell, { type: 'trade' }, baseCtx)).toBe(true);
      expect(matchesListQuery(exp, { type: 'trade' }, baseCtx)).toBe(false);
    });

    it('entry rows: walletId filter matches entry.walletId', () => {
      const entryW1 = makeEntry({ walletId: 'w1' });
      expect(matchesListQuery(entryW1, { walletId: 'w1' }, baseCtx)).toBe(true);
      expect(matchesListQuery(entryW1, { walletId: 'w2' }, baseCtx)).toBe(false);
    });

    it('entry rows: categoryId matches direct or parent category', () => {
      const direct = makeEntry({ categoryId: 'c-parent' });
      const child = makeEntry({ categoryId: 'c-child' });
      const other = makeEntry({ categoryId: 'c-other' });
      const noCat = makeEntry({ categoryId: null });

      expect(matchesListQuery(direct, { categoryId: 'c-parent' }, baseCtx)).toBe(true);
      expect(matchesListQuery(child, { categoryId: 'c-parent' }, baseCtx)).toBe(true);
      expect(matchesListQuery(other, { categoryId: 'c-parent' }, baseCtx)).toBe(false);
      expect(matchesListQuery(noCat, { categoryId: 'c-parent' }, baseCtx)).toBe(false);
    });

    it('entry rows: assetId filter matches entry.assetId', () => {
      const assetRow = makeEntry({ assetId: 'a1' });
      expect(matchesListQuery(assetRow, { assetId: 'a1' }, baseCtx)).toBe(true);
      expect(matchesListQuery(assetRow, { assetId: 'a2' }, baseCtx)).toBe(false);
    });

    it('entry rows: tagId filter matches tagIdsOf(entry.id)', () => {
      const tagged = makeEntry({ id: 'e-tagged' });
      const untagged = makeEntry({ id: 'e-untagged' });

      expect(matchesListQuery(tagged, { tagId: 't-food' }, baseCtx)).toBe(true);
      expect(matchesListQuery(untagged, { tagId: 't-food' }, baseCtx)).toBe(false);
    });

    it('entry rows: q filter searches entry.note ignoring accents', () => {
      const entry = makeEntry({ note: 'Bún chả Hà Nội' });

      expect(matchesListQuery(entry, { q: 'bun cha' }, baseCtx)).toBe(true);
      expect(matchesListQuery(entry, { q: 'phở' }, baseCtx)).toBe(false);
    });

    it('person rows: included when criteria met, excluded by categoryId, assetId, tagId, non-person type, or non-default wallet', () => {
      const person = makePerson({ note: 'Phở bò cùng Lan' });

      // Clean query matches
      expect(matchesListQuery(person, {}, baseCtx)).toBe(true);
      expect(matchesListQuery(person, { type: 'person' }, baseCtx)).toBe(true);

      // Excluded when categoryId set
      expect(matchesListQuery(person, { categoryId: 'c1' }, baseCtx)).toBe(false);

      // Excluded when assetId set
      expect(matchesListQuery(person, { assetId: 'a1' }, baseCtx)).toBe(false);

      // Excluded when tagId set
      expect(matchesListQuery(person, { tagId: 't1' }, baseCtx)).toBe(false);

      // Excluded when type is not person
      expect(matchesListQuery(person, { type: 'expense' }, baseCtx)).toBe(false);

      // Excluded when defaultWalletId is null
      expect(matchesListQuery(person, {}, { ...baseCtx, defaultWalletId: null })).toBe(false);

      // Excluded when walletId is not defaultWalletId
      expect(matchesListQuery(person, { walletId: 'w-other' }, baseCtx)).toBe(false);
      // Included when walletId equals defaultWalletId
      expect(matchesListQuery(person, { walletId: 'w-default' }, baseCtx)).toBe(true);

      // q search on note
      expect(matchesListQuery(person, { q: 'pho bo' }, baseCtx)).toBe(true);
      expect(matchesListQuery(person, { q: 'pizza' }, baseCtx)).toBe(false);
    });
  });
});

describe('compareListRows ties', () => {
  it('orders rows with equal date, time and createdAt by id, so server and saved copy agree', () => {
    const base = { kind: 'person' as const, tripId: 't', date: '2026-11-12', share: 0, total: 0, note: '', people: [], walletId: 'w', currency: 'VND' as const, createdAt: '2026-11-12T00:00:00.000Z' };
    const a = { ...base, id: 'a' };
    const b = { ...base, id: 'b' };
    expect([b, a].sort(compareListRows).map((r) => r.id)).toEqual(['a', 'b']);
    expect([a, b].sort(compareListRows).map((r) => r.id)).toEqual(['a', 'b']);
  });
});
