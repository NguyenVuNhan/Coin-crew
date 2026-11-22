import { describe, it, expect } from 'vitest';
import {
  compareBookRows,
  createGroupWalletResolver,
  filterGroupRows,
  groupRowCategoryId,
  groupRowsFromCopy,
  groupRowsTotals,
  listFromCopy,
  loanPaybacks,
  type BookRow,
  type CategoryView,
  type CopyLookups,
  type EntryView,
  type GroupLinkView,
  type GroupListQuery,
  type GroupRow,
  type GroupSettingsView,
  type SyncEntryRow,
  type TagView,
  type WalletDetailView,
} from '../src/index';

let seq = 1;

function makeRow(overrides: Partial<GroupRow> = {}): GroupRow {
  const id = overrides.id ?? `g-${seq++}`;
  return {
    kind: 'group',
    activityAt: '2026-11-01T00:00:00.000Z',
    id,
    rootId: overrides.rootId ?? id,
    tripId: 'trip-1',
    tripName: 'Đà Lạt',
    isDirect: false,
    source: 'expense',
    date: '2026-11-10',
    title: 'Lẩu gà lá é',
    total: 300_000,
    myShare: 100_000,
    iPaid: false,
    payerName: 'Hùng',
    counterpartName: null,
    people: ['Lan'],
    pending: false,
    link: null,
    createdAt: '2026-11-10T12:00:00.000Z',
    ...overrides,
  };
}

function makeLink(overrides: Partial<GroupLinkView> = {}): GroupLinkView {
  return {
    walletId: null,
    categoryId: null,
    tagIds: [],
    intent: null,
    excludeFromReports: false,
    ...overrides,
  };
}

function makeWallet(overrides: Partial<WalletDetailView> = {}): WalletDetailView {
  return {
    id: 'w-vnd-1',
    name: 'Techcombank',
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

function makeCategory(overrides: Partial<CategoryView> = {}): CategoryView {
  return {
    id: 'c-food',
    parentId: null,
    type: 'expense',
    name: 'Ăn uống',
    icon: 'utensils',
    hidden: false,
    sortOrder: 0,
    ...overrides,
  };
}

function makeTag(overrides: Partial<TagView> = {}): TagView {
  return {
    id: 'tag-1',
    name: 'Nghỉ dưỡng',
    useCount: 1,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<EntryView> = {}): EntryView {
  return {
    id: 'e-1',
    walletId: 'w-vnd-1',
    type: 'expense',
    amount: 50_000,
    currency: 'VND',
    categoryId: 'c-food',
    assetId: null,
    quantity: null,
    transferId: null,
    counterpartWalletId: null,
    date: '2026-11-10',
    time: '12:00',
    note: 'Cà phê',
    tags: [],
    excludeFromReports: false,
    source: 'manual',
    beforeStart: false,
    createdAt: '2026-11-10T12:00:00.000Z',
    ...overrides,
  };
}

function makeSyncEntry(overrides: Partial<SyncEntryRow> = {}): SyncEntryRow {
  return {
    id: 'e-1',
    walletId: 'w-vnd-1',
    type: 'expense',
    amount: 50_000,
    categoryId: 'c-food',
    assetId: null,
    quantity: null,
    transferId: null,
    counterpartWalletId: null,
    date: '2026-11-10',
    time: '12:00',
    note: 'Cà phê',
    tagIds: [],
    excludeFromReports: false,
    createdAt: '2026-11-10T12:00:00.000Z',
    syncVersion: 1,
    ...overrides,
  };
}

const settingsOff: GroupSettingsView = { defaultGroupCategoryId: null, countLoans: false };
const settingsOn: GroupSettingsView = { defaultGroupCategoryId: null, countLoans: true };
const emptyTags = new Map<string, string>();

describe('groupRowCategoryId', () => {
  it('prefers link.categoryId, then settings.defaultGroupCategoryId, then fallbackGroupCategoryId', () => {
    const withLink = makeRow({ link: makeLink({ categoryId: 'cat-own' }) });
    const withoutLinkCat = makeRow({ link: makeLink({ categoryId: null }) });
    const noLink = makeRow({ link: null });

    const withDefault: GroupSettingsView = {
      defaultGroupCategoryId: 'cat-default',
      countLoans: false,
    };

    expect(groupRowCategoryId(withLink, withDefault, 'cat-fallback')).toBe('cat-own');
    expect(groupRowCategoryId(withoutLinkCat, withDefault, 'cat-fallback')).toBe('cat-default');
    expect(groupRowCategoryId(noLink, withDefault, 'cat-fallback')).toBe('cat-default');
    expect(groupRowCategoryId(noLink, settingsOff, 'cat-fallback')).toBe('cat-fallback');
    expect(groupRowCategoryId(noLink, settingsOff, null)).toBeNull();
  });
});

describe('groupRowsTotals', () => {
  it('sums spending and income respecting pending, excludeFromReports, and countLoans', () => {
    const shared = makeRow({
      id: 'g-shared',
      source: 'expense',
      iPaid: true,
      total: 300_000,
      myShare: 100_000,
    });
    const fund = makeRow({
      id: 'g-fund',
      source: 'fund',
      iPaid: true,
      total: 500_000,
      myShare: 0,
    });
    const pending = makeRow({
      id: 'g-pending',
      source: 'expense',
      iPaid: false,
      total: 200_000,
      myShare: 100_000,
      pending: true,
    });
    const excluded = makeRow({
      id: 'g-excluded',
      source: 'expense',
      iPaid: false,
      total: 150_000,
      myShare: 75_000,
      link: makeLink({ excludeFromReports: true }),
    });
    const lent = makeRow({
      id: 'g-lent',
      isDirect: true,
      source: 'expense',
      iPaid: true,
      total: 50_000,
      myShare: 0,
      people: ['Minh'],
      date: '2026-11-02',
      link: makeLink({ intent: 'loan' }),
    });
    const repaid = makeRow({
      id: 'g-repaid',
      isDirect: true,
      source: 'payment',
      iPaid: false,
      total: 70_000,
      myShare: 0,
      counterpartName: 'Minh',
      date: '2026-11-05',
    });

    const rows = [shared, fund, pending, excluded, lent, repaid];
    const paybacks = loanPaybacks(rows);

    expect(groupRowsTotals(rows, settingsOff, paybacks)).toEqual({
      spent: 600_000,
      income: 0,
    });
    expect(groupRowsTotals(rows, settingsOn, paybacks)).toEqual({
      spent: 650_000,
      income: 50_000,
    });
  });
});

describe('compareBookRows', () => {
  it('interleaves entries, person rows, and group rows by date desc then createdAt desc', () => {
    const rows: BookRow[] = [
      {
        kind: 'entry',
        entry: makeEntry({
          id: 'e-old',
          date: '2026-11-10',
          time: '09:00',
          createdAt: '2026-11-10T09:00:00.000Z',
        }),
      },
      makeRow({
        id: 'g-mid',
        date: '2026-11-10',
        createdAt: '2026-11-10T11:00:00.000Z',
      }),
      {
        kind: 'entry',
        entry: makeEntry({
          id: 'e-new',
          date: '2026-11-10',
          time: '15:00',
          createdAt: '2026-11-10T15:00:00.000Z',
        }),
      },
      makeRow({
        id: 'g-latest-day',
        date: '2026-11-12',
        createdAt: '2026-11-12T08:00:00.000Z',
      }),
      {
        kind: 'person',
        id: 'p-1',
        tripId: 't-direct',
        date: '2026-11-10',
        share: 25_000,
        total: 50_000,
        note: 'Coffee',
        people: ['Minh'],
        walletId: 'w-vnd-1',
        currency: 'VND',
        createdAt: '2026-11-10T13:00:00.000Z',
      },
    ];

    const sorted = [...rows].sort(compareBookRows);
    expect(sorted.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual([
      'g-latest-day',
      'e-new',
      'p-1',
      'g-mid',
      'e-old',
    ]);
  });
});

describe('filterGroupRows', () => {
  it('drops all rows when groups is not show', () => {
    const rows = [makeRow({ id: 'g1' }), makeRow({ id: 'g2' })];
    expect(filterGroupRows(rows, {}, emptyTags)).toEqual([]);
    expect(filterGroupRows(rows, { groups: 'hide' }, emptyTags)).toEqual([]);
    expect(filterGroupRows(rows, { groups: 'show' }, emptyTags).map((r) => r.id)).toEqual([
      'g1',
      'g2',
    ]);
  });

  it('drops all rows when assetId is set', () => {
    const rows = [makeRow({ id: 'g1' })];
    expect(filterGroupRows(rows, { groups: 'show', assetId: 'asset-1' }, emptyTags)).toEqual([]);
  });

  it('filters by type (group, expense, income, and drops transfer/person/trade)', () => {
    const spendingRow = makeRow({
      id: 'g-spend',
      source: 'expense',
      iPaid: false,
      total: 200_000,
      myShare: 100_000,
    });
    const paidForOthersOnly = makeRow({
      id: 'g-movement',
      source: 'expense',
      iPaid: true,
      total: 150_000,
      myShare: 0,
    });
    const fundRow = makeRow({
      id: 'g-fund',
      source: 'fund',
      iPaid: true,
      total: 500_000,
      myShare: 0,
    });
    const pendingRow = makeRow({
      id: 'g-pending',
      source: 'expense',
      iPaid: false,
      total: 100_000,
      myShare: 50_000,
      pending: true,
    });
    const borrowedLoan = makeRow({
      id: 'g-borrow',
      isDirect: true,
      source: 'expense',
      iPaid: false,
      total: 80_000,
      myShare: 80_000,
      payerName: 'Minh',
      date: '2026-11-01',
      link: makeLink({ intent: 'loan' }),
    });
    const repayment = makeRow({
      id: 'g-repay',
      isDirect: true,
      source: 'payment',
      iPaid: true,
      total: 40_000,
      myShare: 0,
      counterpartName: 'Minh',
      date: '2026-11-05',
    });

    const rows = [spendingRow, paidForOthersOnly, fundRow, pendingRow, borrowedLoan, repayment];
    const paybacks = loanPaybacks(rows);

    expect(filterGroupRows(rows, { groups: 'show', type: 'transfer' }, emptyTags)).toEqual([]);
    expect(filterGroupRows(rows, { groups: 'show', type: 'person' }, emptyTags)).toEqual([]);
    expect(filterGroupRows(rows, { groups: 'show', type: 'trade' }, emptyTags)).toEqual([]);

    expect(
      filterGroupRows(rows, { groups: 'show', type: 'group' }, emptyTags).map((r) => r.id),
    ).toEqual(['g-spend', 'g-movement', 'g-fund', 'g-pending', 'g-borrow', 'g-repay']);

    // With countLoans off: only shared spending + fund count as expense; none count as income
    expect(
      filterGroupRows(rows, { groups: 'show', type: 'expense' }, emptyTags, undefined, {
        settings: settingsOff,
        paybacks,
      }).map((r) => r.id),
    ).toEqual(['g-spend', 'g-fund']);
    expect(
      filterGroupRows(rows, { groups: 'show', type: 'income' }, emptyTags, undefined, {
        settings: settingsOff,
        paybacks,
      }),
    ).toEqual([]);

    // With countLoans on: repayment counts as expense, borrowed loan counts as income
    expect(
      filterGroupRows(rows, { groups: 'show', type: 'expense' }, emptyTags, undefined, {
        settings: settingsOn,
        paybacks,
      }).map((r) => r.id),
    ).toEqual(['g-spend', 'g-fund', 'g-repay']);
    expect(
      filterGroupRows(rows, { groups: 'show', type: 'income' }, emptyTags, undefined, {
        settings: settingsOn,
        paybacks,
      }).map((r) => r.id),
    ).toEqual(['g-borrow']);
  });

  it('filters by tripId', () => {
    const rows = [
      makeRow({ id: 'g-t1', tripId: 'trip-1' }),
      makeRow({ id: 'g-t2', tripId: 'trip-2' }),
    ];
    expect(
      filterGroupRows(rows, { groups: 'show', tripId: 'trip-2' }, emptyTags).map((r) => r.id),
    ).toEqual(['g-t2']);
  });

  it('filters by walletId using resolveWalletId', () => {
    const wDefault = makeWallet({ id: 'w-tcb', currency: 'VND', isDefault: true });
    const wCash = makeWallet({ id: 'w-cash', currency: 'VND' });
    const resolveWalletId = createGroupWalletResolver([wDefault, wCash], 'w-tcb');

    const rows = [
      makeRow({ id: 'g-default', link: null }),
      makeRow({ id: 'g-moved', link: makeLink({ walletId: 'w-cash' }) }),
    ];

    expect(
      filterGroupRows(rows, { groups: 'show', walletId: 'w-tcb' }, emptyTags, resolveWalletId).map(
        (r) => r.id,
      ),
    ).toEqual(['g-default']);
    expect(
      filterGroupRows(rows, { groups: 'show', walletId: 'w-cash' }, emptyTags, resolveWalletId).map(
        (r) => r.id,
      ),
    ).toEqual(['g-moved']);

    // No VND wallet -> resolver returns null; walletId filter returns empty, unfiltered keeps all
    const usdOnly = [makeWallet({ id: 'w-usd', currency: 'USD', isDefault: true })];
    const resolveNull = createGroupWalletResolver(usdOnly, 'w-usd');
    expect(
      filterGroupRows(rows, { groups: 'show', walletId: 'w-usd' }, emptyTags, resolveNull),
    ).toEqual([]);
    expect(
      filterGroupRows(rows, { groups: 'show' }, emptyTags, resolveNull).map((r) => r.id),
    ).toEqual(['g-default', 'g-moved']);
  });

  it('filters by categoryId against groupRowCategoryId (including parent category)', () => {
    const rows = [
      makeRow({ id: 'g-override', link: makeLink({ categoryId: 'c-food-child' }) }),
      makeRow({ id: 'g-default', link: null }),
    ];
    const settings: GroupSettingsView = { defaultGroupCategoryId: 'c-travel', countLoans: false };
    const parentOf = (id: string) => (id === 'c-food-child' ? 'c-food' : null);

    expect(
      filterGroupRows(rows, { groups: 'show', categoryId: 'c-food' }, emptyTags, undefined, {
        settings,
        categoryParentOf: parentOf,
      }).map((r) => r.id),
    ).toEqual(['g-override']);

    expect(
      filterGroupRows(rows, { groups: 'show', categoryId: 'c-travel' }, emptyTags, undefined, {
        settings,
        categoryParentOf: parentOf,
      }).map((r) => r.id),
    ).toEqual(['g-default']);

    // Falls back to fallbackGroupCategoryId when settings.defaultGroupCategoryId is null
    expect(
      filterGroupRows(rows, { groups: 'show', categoryId: 'c-group-starter' }, emptyTags, undefined, {
        settings: settingsOff,
        fallbackGroupCategoryId: 'c-group-starter',
      }).map((r) => r.id),
    ).toEqual(['g-default']);
  });

  it('filters by tagId against link.tagIds', () => {
    const rows = [
      makeRow({ id: 'g-tagged', link: makeLink({ tagIds: ['tag-1', 'tag-2'] }) }),
      makeRow({ id: 'g-untagged', link: null }),
    ];
    expect(
      filterGroupRows(rows, { groups: 'show', tagId: 'tag-2' }, emptyTags).map((r) => r.id),
    ).toEqual(['g-tagged']);
  });

  it('filters by q accent-insensitively across title, tripName, payerName, counterpartName, and tag names', () => {
    const rows = [
      makeRow({
        id: 'g-title-trip',
        tripName: 'Đà Lạt · T11',
        title: 'Lẩu gà lá é',
        payerName: 'Hùng',
        counterpartName: null,
        link: null,
      }),
      makeRow({
        id: 'g-pay-tag',
        tripName: 'Phú Quốc',
        title: 'Thanh toán',
        source: 'payment',
        payerName: 'Minh',
        counterpartName: 'Phương',
        link: makeLink({ tagIds: ['tag-1'] }),
      }),
    ];
    const tagNames = new Map<string, string>([['tag-1', 'Nghỉ dưỡng']]);

    expect(
      filterGroupRows(rows, { groups: 'show', q: 'lau ga' }, tagNames).map((r) => r.id),
    ).toEqual(['g-title-trip']);
    expect(
      filterGroupRows(rows, { groups: 'show', q: 'da lat' }, tagNames).map((r) => r.id),
    ).toEqual(['g-title-trip']);
    expect(
      filterGroupRows(rows, { groups: 'show', q: 'hung' }, tagNames).map((r) => r.id),
    ).toEqual(['g-title-trip']);
    expect(
      filterGroupRows(rows, { groups: 'show', q: 'phuong' }, tagNames).map((r) => r.id),
    ).toEqual(['g-pay-tag']);
    expect(
      filterGroupRows(rows, { groups: 'show', q: 'nghi duong' }, tagNames).map((r) => r.id),
    ).toEqual(['g-pay-tag']);
    expect(
      filterGroupRows(rows, { groups: 'show', q: '   ' }, tagNames).map((r) => r.id),
    ).toEqual(['g-title-trip', 'g-pay-tag']);
  });

  it('filters by month and from/to period', () => {
    const rows = [
      makeRow({ id: 'g-oct', date: '2026-10-31' }),
      makeRow({ id: 'g-nov', date: '2026-11-15' }),
      makeRow({ id: 'g-dec', date: '2026-12-01' }),
    ];
    expect(
      filterGroupRows(rows, { groups: 'show', month: '2026-11' }, emptyTags).map((r) => r.id),
    ).toEqual(['g-nov']);
    expect(
      filterGroupRows(
        rows,
        { groups: 'show', from: '2026-10-31', to: '2026-11-30' },
        emptyTags,
      ).map((r) => r.id),
    ).toEqual(['g-oct', 'g-nov']);
  });
});

describe('copy and server agree', () => {
  it('groupRowsFromCopy and server-shaped filterGroupRows return the same ids and totals across queries', () => {
    const wallets: WalletDetailView[] = [
      makeWallet({ id: 'w-tcb', name: 'Techcombank', currency: 'VND', isDefault: true }),
      makeWallet({ id: 'w-cash', name: 'Tiền mặt', currency: 'VND', isDefault: false }),
      makeWallet({ id: 'w-usd', name: 'USD', currency: 'USD', isDefault: false }),
    ];
    const categories: CategoryView[] = [
      makeCategory({ id: 'c-food', parentId: null, name: 'Ăn uống' }),
      makeCategory({ id: 'c-coffee', parentId: 'c-food', name: 'Cà phê' }),
      makeCategory({ id: 'c-travel', parentId: null, name: 'Du lịch' }),
      makeCategory({ id: 'c-group', parentId: null, name: 'Nhóm' }),
    ];
    const tags: TagView[] = [
      makeTag({ id: 'tag-dl', name: 'Đà Lạt' }),
      makeTag({ id: 'tag-work', name: 'Công việc' }),
    ];

    const settings: GroupSettingsView = {
      defaultGroupCategoryId: 'c-travel',
      countLoans: true,
    };

    const seedGroupRows: GroupRow[] = [
      makeRow({
        id: 'g-oct-loan',
        tripId: 't-direct',
        tripName: 'Với người khác',
        isDirect: true,
        source: 'expense',
        date: '2026-10-20',
        title: 'Cho Minh vay',
        total: 100_000,
        myShare: 0,
        iPaid: true,
        payerName: 'Nhan',
        people: ['Minh'],
        link: makeLink({ intent: 'loan' }),
        createdAt: '2026-10-20T10:00:00.000Z',
      }),
      makeRow({
        id: 'g-nov-dinner',
        tripId: 't-dalat',
        tripName: 'Đà Lạt',
        isDirect: false,
        source: 'expense',
        date: '2026-11-12',
        title: 'Bữa tối',
        total: 300_000,
        myShare: 100_000,
        iPaid: true,
        payerName: 'Nhan',
        people: ['Hùng', 'Lan'],
        link: makeLink({ walletId: 'w-cash', categoryId: 'c-coffee', tagIds: ['tag-dl'] }),
        createdAt: '2026-11-12T19:00:00.000Z',
      }),
      makeRow({
        id: 'g-nov-taxi',
        tripId: 't-dalat',
        tripName: 'Đà Lạt',
        isDirect: false,
        source: 'expense',
        date: '2026-11-11',
        title: 'Taxi sân bay',
        total: 240_000,
        myShare: 80_000,
        iPaid: false,
        payerName: 'Hùng',
        people: ['Hùng', 'Minh'],
        link: null,
        createdAt: '2026-11-11T09:00:00.000Z',
      }),
      makeRow({
        id: 'g-nov-fund',
        tripId: 't-sport',
        tripName: 'Cầu lông T5',
        isDirect: false,
        source: 'fund',
        date: '2026-11-14',
        title: 'Đóng quỹ tháng 11',
        total: 500_000,
        myShare: 0,
        iPaid: true,
        payerName: 'Nhan',
        people: [],
        link: makeLink({ tagIds: ['tag-work'] }),
        createdAt: '2026-11-14T18:00:00.000Z',
      }),
      makeRow({
        id: 'g-nov-repay',
        tripId: 't-direct',
        tripName: 'Với người khác',
        isDirect: true,
        source: 'payment',
        date: '2026-11-15',
        title: 'Minh trả tiền',
        total: 120_000,
        myShare: 0,
        iPaid: false,
        payerName: 'Minh',
        counterpartName: 'Minh',
        people: [],
        link: null,
        createdAt: '2026-11-15T10:00:00.000Z',
      }),
    ];

    const seedEntries: SyncEntryRow[] = [
      makeSyncEntry({ id: 'e-nov', walletId: 'w-tcb', date: '2026-11-13', note: 'Bánh mì' }),
    ];

    const lookups: CopyLookups = { wallets, categories, tags };
    const resolveWalletId = createGroupWalletResolver(wallets, 'w-tcb');
    const tagNames = new Map(tags.map((t) => [t.id, t.name]));
    const categoryParentById = new Map(categories.map((c) => [c.id, c.parentId]));
    const fullPaybacks = loanPaybacks(seedGroupRows);

    const queries: GroupListQuery[] = [
      { month: '2026-11', groups: 'show' },
      { month: '2026-11', groups: 'hide' },
      { month: '2026-11', groups: 'show', tripId: 't-dalat' },
      { month: '2026-11', groups: 'show', walletId: 'w-cash' },
      { month: '2026-11', groups: 'show', walletId: 'w-tcb' },
      { month: '2026-11', groups: 'show', categoryId: 'c-food' },
      { month: '2026-11', groups: 'show', categoryId: 'c-travel' },
      { month: '2026-11', groups: 'show', tagId: 'tag-dl' },
      { month: '2026-11', groups: 'show', type: 'expense' },
      { month: '2026-11', groups: 'show', type: 'income' },
      { month: '2026-11', groups: 'show', type: 'group' },
      { month: '2026-11', groups: 'show', q: 'da lat' },
      { month: '2026-11', groups: 'show', q: 'hung' },
      { month: '2026-11', groups: 'show', q: 'cong viec' },
    ];

    for (const query of queries) {
      // Server-side: range-loaded rows (Nov) + full-history paybacks + filterGroupRows
      const serverMonthRows = seedGroupRows
        .filter((r) => r.date >= '2026-11-01' && r.date <= '2026-11-30')
        .sort(compareBookRows);
      const serverFiltered = filterGroupRows(serverMonthRows, query, tagNames, resolveWalletId, {
        settings,
        paybacks: fullPaybacks,
        fallbackGroupCategoryId: 'c-group',
        categoryParentOf: (id) => categoryParentById.get(id) ?? null,
        period: { from: '2026-11-01', to: '2026-11-30' },
      });
      const serverTotals = groupRowsTotals(serverFiltered, settings, fullPaybacks);

      // Copy-side: full-history groupRows passed to groupRowsFromCopy
      const copyFiltered = groupRowsFromCopy(
        seedGroupRows,
        query,
        {
          ...lookups,
          today: '2026-11-21',
          settings,
          fallbackGroupCategoryId: 'c-group',
        },
        resolveWalletId,
      );
      const copyTotals = groupRowsTotals(copyFiltered, settings, fullPaybacks);

      expect(copyFiltered.map((r) => r.id)).toEqual(serverFiltered.map((r) => r.id));
      expect(copyTotals).toEqual(serverTotals);
    }

    // listFromCopy still returns ListRow[] for existing callers
    const entryList = listFromCopy(
      { entries: seedEntries, ledger: [] },
      { month: '2026-11', groups: 'show' },
      lookups,
      '2026-11-21',
    );
    expect(entryList.map((r) => (r.kind === 'entry' ? r.entry.id : r.id))).toEqual(['e-nov']);
  });
});

describe('filtering by a group', () => {
  it('listFromCopy returns no personal entries when a tripId is set', async () => {
    const { listFromCopy } = await import('../src/copyRows');
    const rows = listFromCopy(
      { entries: [], ledger: [] } as unknown as Parameters<typeof listFromCopy>[0],
      { month: '2026-11', tripId: 'trip-1' },
      { wallets: [], categories: [], tags: [] } as unknown as Parameters<typeof listFromCopy>[2],
      '2026-11-21',
    );
    expect(rows).toEqual([]);
  });
});
