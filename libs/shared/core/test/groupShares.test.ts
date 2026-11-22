import { describe, it, expect } from 'vitest';
import {
  groupRowEffect,
  loanPaybacks,
  groupWalletEntries,
  groupNetFor,
  type GroupRow,
  type GroupLinkView,
  type GroupSettingsView,
} from '../src/groupShares';
import type { CalcWallet } from '../src/wallets';

let seq = 1;

function makeRow(overrides: Partial<GroupRow> = {}): GroupRow {
  const id = overrides.id ?? `tx-${seq++}`;
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
    title: 'Dinner',
    total: 300_000,
    myShare: 100_000,
    iPaid: false,
    payerName: 'Hùng',
    counterpartName: null,
    people: ['Lan'],
    pending: false,
    link: null,
    createdAt: '2026-11-10T12:00:00Z',
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

function makeWallet(
  overrides: Partial<CalcWallet & { kind?: string; isDefault?: boolean }> &
    Pick<CalcWallet, 'id' | 'currency'>,
): CalcWallet & { kind?: string; isDefault?: boolean } {
  return {
    startAmount: 0,
    startDate: '2026-11-01',
    startCostVnd: null,
    archived: false,
    ...overrides,
  };
}

const settingsOff: GroupSettingsView = { defaultGroupCategoryId: null, countLoans: false };
const settingsOn: GroupSettingsView = { defaultGroupCategoryId: null, countLoans: true };

describe('groupRowEffect', () => {
  it('expense, not loan, someone else paid → spending = myShare, income = 0, walletDelta = 0', () => {
    const row = makeRow({ source: 'expense', iPaid: false, total: 300_000, myShare: 100_000 });
    expect(groupRowEffect(row, settingsOff)).toEqual({
      spending: 100_000,
      income: 0,
      walletDelta: 0,
    });
  });

  it('expense, not loan, iPaid → spending = myShare, income = 0, walletDelta = -total', () => {
    const row = makeRow({ source: 'expense', iPaid: true, total: 300_000, myShare: 100_000 });
    expect(groupRowEffect(row, settingsOff)).toEqual({
      spending: 100_000,
      income: 0,
      walletDelta: -300_000,
    });
  });

  it('fund, iPaid → spending = total, income = 0, walletDelta = -total', () => {
    const row = makeRow({ source: 'fund', iPaid: true, total: 300_000, myShare: 0 });
    expect(groupRowEffect(row, settingsOff)).toEqual({
      spending: 300_000,
      income: 0,
      walletDelta: -300_000,
    });
  });

  it('loan, iPaid (I lent) with countLoans false and true', () => {
    const row = makeRow({
      isDirect: true,
      source: 'expense',
      iPaid: true,
      total: 50_000,
      myShare: 0,
      people: ['Minh'],
      link: makeLink({ intent: 'loan' }),
    });
    expect(groupRowEffect(row, settingsOff)).toEqual({
      spending: 0,
      income: 0,
      walletDelta: -50_000,
    });
    expect(groupRowEffect(row, settingsOn)).toEqual({
      spending: 50_000,
      income: 0,
      walletDelta: -50_000,
    });
  });

  it('loan, not iPaid (I borrowed) with countLoans false and true', () => {
    const row = makeRow({
      isDirect: true,
      source: 'expense',
      iPaid: false,
      total: 50_000,
      myShare: 50_000,
      payerName: 'Minh',
      people: [],
      link: makeLink({ intent: 'loan' }),
    });
    expect(groupRowEffect(row, settingsOff)).toEqual({
      spending: 0,
      income: 0,
      walletDelta: 50_000,
    });
    expect(groupRowEffect(row, settingsOn)).toEqual({
      spending: 0,
      income: 50_000,
      walletDelta: 50_000,
    });
  });

  it('payment, iPaid with countLoans false and true', () => {
    const row = makeRow({
      isDirect: true,
      source: 'payment',
      iPaid: true,
      total: 40_000,
      myShare: 0,
      counterpartName: 'Minh',
    });
    expect(groupRowEffect(row, settingsOff, 20_000)).toEqual({
      spending: 0,
      income: 0,
      walletDelta: -40_000,
    });
    expect(groupRowEffect(row, settingsOn, 20_000)).toEqual({
      spending: 20_000,
      income: 0,
      walletDelta: -40_000,
    });
  });

  it('payment, not iPaid with countLoans false and true', () => {
    const row = makeRow({
      isDirect: true,
      source: 'payment',
      iPaid: false,
      total: 40_000,
      myShare: 0,
      counterpartName: 'Minh',
    });
    expect(groupRowEffect(row, settingsOff, 20_000)).toEqual({
      spending: 0,
      income: 0,
      walletDelta: 40_000,
    });
    expect(groupRowEffect(row, settingsOn, 20_000)).toEqual({
      spending: 0,
      income: 20_000,
      walletDelta: 40_000,
    });
  });

  it('pending row returns all zeroes', () => {
    const row = makeRow({
      source: 'expense',
      iPaid: true,
      total: 300_000,
      myShare: 100_000,
      pending: true,
    });
    expect(groupRowEffect(row, settingsOn)).toEqual({
      spending: 0,
      income: 0,
      walletDelta: 0,
    });
  });

  it('excludeFromReports zeroes spending and income while keeping walletDelta', () => {
    const row = makeRow({
      source: 'expense',
      iPaid: true,
      total: 300_000,
      myShare: 100_000,
      link: makeLink({ excludeFromReports: true }),
    });
    expect(groupRowEffect(row, settingsOff)).toEqual({
      spending: 0,
      income: 0,
      walletDelta: -300_000,
    });
  });
});

describe('loanPaybacks', () => {
  it('lent 50 000 then received 30 000 then 40 000 → paybacks 30 000 and 20 000', () => {
    const loan = makeRow({
      id: 'loan-1',
      isDirect: true,
      source: 'expense',
      iPaid: true,
      total: 50_000,
      myShare: 0,
      people: ['Minh'],
      date: '2026-11-01',
      createdAt: '2026-11-01T10:00:00Z',
      link: makeLink({ intent: 'loan' }),
    });
    const pay1 = makeRow({
      id: 'pay-1',
      isDirect: true,
      source: 'payment',
      iPaid: false,
      total: 30_000,
      myShare: 0,
      counterpartName: 'Minh',
      date: '2026-11-02',
      createdAt: '2026-11-02T10:00:00Z',
    });
    const pay2 = makeRow({
      id: 'pay-2',
      isDirect: true,
      source: 'payment',
      iPaid: false,
      total: 40_000,
      myShare: 0,
      counterpartName: 'Minh',
      date: '2026-11-03',
      createdAt: '2026-11-03T10:00:00Z',
    });

    // Pass out of chronological order to verify sorting by (date, createdAt)
    const paybacks = loanPaybacks([pay2, loan, pay1]);
    expect(paybacks.get('pay-1')).toBe(30_000);
    expect(paybacks.get('pay-2')).toBe(20_000);
  });

  it('borrowed loan repaid by iPaid payment, and ignores non-direct payments', () => {
    const borrowed = makeRow({
      id: 'loan-b',
      isDirect: true,
      source: 'expense',
      iPaid: false,
      total: 50_000,
      myShare: 50_000,
      payerName: 'Lan',
      people: [],
      date: '2026-11-01',
      createdAt: '2026-11-01T10:00:00Z',
      link: makeLink({ intent: 'loan' }),
    });
    const groupPay = makeRow({
      id: 'pay-group',
      isDirect: false,
      source: 'payment',
      iPaid: true,
      total: 50_000,
      myShare: 0,
      counterpartName: 'Lan',
      date: '2026-11-02',
      createdAt: '2026-11-02T10:00:00Z',
    });
    const directPay = makeRow({
      id: 'pay-direct',
      isDirect: true,
      source: 'payment',
      iPaid: true,
      total: 30_000,
      myShare: 0,
      counterpartName: 'Lan',
      date: '2026-11-03',
      createdAt: '2026-11-03T10:00:00Z',
    });

    const paybacks = loanPaybacks([borrowed, groupPay, directPay]);
    expect(paybacks.get('pay-group') ?? 0).toBe(0);
    expect(paybacks.get('pay-direct')).toBe(30_000);
  });
});

describe('groupWalletEntries', () => {
  it('default USD wallet + VND wallet → entries on the VND wallet', () => {
    const usd = makeWallet({ id: 'w-usd', currency: 'USD', isDefault: true });
    const vnd = makeWallet({ id: 'w-vnd', currency: 'VND' });

    const paid = makeRow({
      id: 'e1',
      source: 'expense',
      iPaid: true,
      total: 300_000,
      myShare: 100_000,
      date: '2026-11-10',
      createdAt: '2026-11-10T12:00:00Z',
    });
    const someoneElse = makeRow({
      id: 'e2',
      source: 'expense',
      iPaid: false,
      total: 200_000,
      myShare: 100_000,
    });
    const received = makeRow({
      id: 'p1',
      source: 'payment',
      iPaid: false,
      total: 120_000,
      myShare: 0,
      date: '2026-11-11',
      createdAt: '2026-11-11T09:00:00Z',
    });
    const pending = makeRow({
      id: 'e3',
      source: 'expense',
      iPaid: true,
      total: 50_000,
      myShare: 50_000,
      pending: true,
    });

    const entries = groupWalletEntries(
      [paid, someoneElse, received, pending],
      [usd, vnd],
      'w-usd',
      settingsOff,
    );

    expect(entries).toEqual([
      {
        id: 'g:e1',
        walletId: 'w-vnd',
        type: 'expense',
        amount: 300_000,
        date: '2026-11-10',
        time: null,
        createdAt: '2026-11-10T12:00:00Z',
        transferId: null,
        excludeFromReports: true,
      },
      {
        id: 'g:p1',
        walletId: 'w-vnd',
        type: 'income',
        amount: 120_000,
        date: '2026-11-11',
        time: null,
        createdAt: '2026-11-11T09:00:00Z',
        transferId: null,
        excludeFromReports: true,
      },
    ]);
  });

  it('no VND wallet → []', () => {
    const usd = makeWallet({ id: 'w-usd', currency: 'USD', isDefault: true });
    const paid = makeRow({
      id: 'e1',
      source: 'expense',
      iPaid: true,
      total: 300_000,
      myShare: 100_000,
    });

    expect(groupWalletEntries([paid], [usd], 'w-usd', settingsOff)).toEqual([]);
  });

  it('respects link.walletId when VND and falls back to chosen when non-VND or missing', () => {
    const vndDefault = makeWallet({ id: 'w-vnd-1', currency: 'VND', isDefault: true });
    const vndOther = makeWallet({ id: 'w-vnd-2', currency: 'VND' });
    const usd = makeWallet({ id: 'w-usd', currency: 'USD' });

    const r1 = makeRow({
      id: 'e1',
      source: 'expense',
      iPaid: true,
      total: 100_000,
      myShare: 50_000,
      link: makeLink({ walletId: 'w-vnd-2' }),
    });
    const r2 = makeRow({
      id: 'e2',
      source: 'expense',
      iPaid: true,
      total: 200_000,
      myShare: 100_000,
      link: makeLink({ walletId: 'w-usd' }),
    });
    const r3 = makeRow({
      id: 'e3',
      source: 'expense',
      iPaid: true,
      total: 50_000,
      myShare: 50_000,
      link: makeLink({ walletId: 'w-missing' }),
    });

    const entries = groupWalletEntries(
      [r1, r2, r3],
      [vndDefault, vndOther, usd],
      'w-vnd-1',
      settingsOff,
    );
    expect(entries.map((e) => [e.id, e.walletId])).toEqual([
      ['g:e1', 'w-vnd-2'],
      ['g:e2', 'w-vnd-1'],
      ['g:e3', 'w-vnd-1'],
    ]);
  });

  it('skips archived and investment VND wallets when picking fallback', () => {
    const archivedVnd = makeWallet({ id: 'w-arch', currency: 'VND', archived: true });
    const investVnd = makeWallet({ id: 'w-inv', currency: 'VND', kind: 'investment' });
    const activeVnd = makeWallet({ id: 'w-ok', currency: 'VND', kind: 'everyday' });

    const paid = makeRow({
      id: 'e1',
      source: 'expense',
      iPaid: true,
      total: 100_000,
      myShare: 50_000,
    });

    const entries = groupWalletEntries(
      [paid],
      [archivedVnd, investVnd, activeVnd],
      'w-arch',
      settingsOff,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.walletId).toBe('w-ok');
  });
});

describe('groupNetFor', () => {
  it('paid 300 000 share 100 000, share 80 000 on Hùng taxi, paid Lan 50 000, received 120 000 → 50 000', () => {
    const rows: GroupRow[] = [
      makeRow({
        tripId: 't1',
        source: 'expense',
        iPaid: true,
        total: 300_000,
        myShare: 100_000,
      }),
      makeRow({
        tripId: 't1',
        source: 'expense',
        iPaid: false,
        total: 240_000,
        myShare: 80_000,
        payerName: 'Hùng',
      }),
      makeRow({
        tripId: 't1',
        source: 'payment',
        iPaid: true,
        total: 50_000,
        myShare: 0,
        counterpartName: 'Lan',
      }),
      makeRow({
        tripId: 't1',
        source: 'payment',
        iPaid: false,
        total: 120_000,
        myShare: 0,
        counterpartName: 'Hùng',
      }),
      // Fund contribution, pending row, and other trip row should all be ignored
      makeRow({
        tripId: 't1',
        source: 'fund',
        iPaid: true,
        total: 500_000,
        myShare: 0,
      }),
      makeRow({
        tripId: 't1',
        source: 'expense',
        iPaid: true,
        total: 999_000,
        myShare: 0,
        pending: true,
      }),
      makeRow({
        tripId: 't2',
        source: 'expense',
        iPaid: true,
        total: 777_000,
        myShare: 0,
      }),
    ];

    expect(groupNetFor(rows, 't1')).toBe(50_000);
  });
});
