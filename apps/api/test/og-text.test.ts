import { describe, it, expect } from 'vitest';
import { pageMeta, OG_TEXT } from '../src/og/text';
import type { TripSnapshot } from '../src/trips/snapshot';
import type { ExpenseView } from '@fsl/core';

const NOW = new Date('2026-10-20T20:00:00Z');

type SnapOverrides = {
  trip?: Partial<TripSnapshot['trip']>;
  people?: TripSnapshot['people'];
  expenses?: TripSnapshot['expenses'];
  [key: string]: unknown;
};

function snap(overrides: SnapOverrides = {}): TripSnapshot {
  const { trip: tripOverrides, people: peopleOverrides, expenses: expensesOverrides, ...rest } = overrides;
  return {
    trip: {
      id: 't1',
      name: 'Đà Lạt · Oct 2026',
      currency: 'VND',
      fewestTransfers: false,
      archived: false,
      version: 1,
      preset: 'trip',
      defaultLang: 'vi',
      total: 4900000,
      ...tripOverrides,
    },
    people: peopleOverrides ?? [
      { id: 'p1', name: 'An', status: 'active', isMember: true, bank: 'none' },
      { id: 'p2', name: 'Bình', status: 'active', isMember: false, bank: 'none' },
      { id: 'p3', name: 'Chi', status: 'active', isMember: false, bank: 'none' },
      { id: 'p4', name: 'Dũng', status: 'active', isMember: false, bank: 'none' },
      { id: 'p5', name: 'Em (chờ duyệt)', status: 'pending', isMember: false, bank: 'none' },
    ],
    balances: {},
    suggestions: [],
    expenses: expensesOverrides ?? [],
    payments: [],
    ...rest,
  } as unknown as TripSnapshot;
}

function exp(overrides: Partial<ExpenseView> = {}): ExpenseView {
  return {
    id: 'e1',
    description: 'Bánh tráng nướng',
    amount: 100000,
    spentOn: '2026-10-20',
    payerId: 'p1',
    mode: 'equal',
    status: 'approved',
    rejectReason: null,
    disabledByName: null,
    createdById: 'p1',
    shares: [
      { participantId: 'p1', amount: 25000, inputValue: 1 },
      { participantId: 'p2', amount: 25000, inputValue: 1 },
      { participantId: 'p3', amount: 25000, inputValue: 1 },
      { participantId: 'p4', amount: 25000, inputValue: 1 },
    ],
    ...overrides,
  };
}

describe('pageMeta', () => {
  it('generic card', () => {
    const meta = pageMeta({ kind: 'generic' });
    expect(meta.title).toBe('CoinCrew (Tiền Đâu)');
    expect(meta.description).toBe('Chia tiền nhóm, trả nhau bằng VietQR.');
    expect(meta.image).toBe('trip');
    expect(meta.locale).toBe('vi_VN');
  });

  it('dead card', () => {
    const meta = pageMeta({ kind: 'dead' });
    expect(meta.description).toBe('Link này không còn dùng được. Hỏi người tạo nhóm link mới.');
  });

  it('group card with a total, dated in Vietnam time', () => {
    const meta = pageMeta({
      kind: 'group',
      snapshot: snap(),
      now: NOW,
    });
    expect(meta.title).toBe('Đà Lạt · Oct 2026');
    expect(meta.description).toBe('Đến 21/10: tổng chi 4.900.000₫ · 4 người — mở để xem ai cần trả ai bao nhiêu.');
    expect(meta.image).toBe('trip');
    expect(meta.locale).toBe('vi_VN');
  });

  it('group card in English', () => {
    const meta = pageMeta({
      kind: 'group',
      snapshot: snap({ trip: { defaultLang: 'en' } }),
      now: NOW,
    });
    expect(meta.description).toBe('As of 21 Oct: 4.900.000₫ spent · 4 people — open to see who owes whom.');
    expect(meta.locale).toBe('en_US');
  });

  it('group card with no expenses', () => {
    const meta = pageMeta({
      kind: 'group',
      snapshot: snap({ trip: { total: 0 } }),
      now: NOW,
    });
    expect(meta.description).toBe('Chưa có chi tiêu nào · 4 người — mở để thêm và chia tiền.');
  });

  it('sport group card', () => {
    const meta = pageMeta({
      kind: 'group',
      snapshot: snap({ trip: { preset: 'sport' } }),
      now: NOW,
    });
    expect(meta.description.startsWith('Nhóm thể thao · Đến 21/10')).toBe(true);
    expect(meta.image).toBe('sport');
  });

  it('sport expense breakdown with different rates', () => {
    const expense = exp({
      description: 'Cầu lông tối T5',
      meta: {
        sport: {
          court: 300000,
          shuttlecocks: [{ qty: 2, unitPrice: 60000 }],
          extra: 50000,
          maleSlotRate: 45000,
          femaleSlotRate: 35000,
          rule: { kind: 'equal' },
          entries: [
            { participantId: 'p1', maleSlots: 2, femaleSlots: 0 },
            { participantId: 'p2', maleSlots: 0, femaleSlots: 1 },
            { participantId: 'p3', maleSlots: 1, femaleSlots: 0, fixedAmount: 20000 },
          ],
        },
      },
    });
    const meta = pageMeta({
      kind: 'expense',
      snapshot: snap(),
      expense,
      now: NOW,
    });
    expect(meta.title).toBe('Cầu lông tối T5 · Đà Lạt · Oct 2026');
    expect(meta.description).toBe(
      'Sân 300.000₫ · Cầu 120.000₫ · Phụ phí 50.000₫ · Nam 45.000₫ / Nữ 35.000₫ — mở để lấy mã QR.',
    );
  });

  it('sport expense with one rate', () => {
    const expense = exp({
      description: 'Cầu lông sáng T7',
      meta: {
        sport: {
          court: 300000,
          shuttlecocks: [{ qty: 0, unitPrice: 0 }],
          extra: 0,
          rule: { kind: 'equal' },
          maleSlotRate: 100000,
          femaleSlotRate: 100000,
          entries: [
            { participantId: 'p1', maleSlots: 1, femaleSlots: 0 },
            { participantId: 'p2', maleSlots: 0, femaleSlots: 1 },
          ],
        },
      },
    });
    const meta = pageMeta({
      kind: 'expense',
      snapshot: snap(),
      expense,
      now: NOW,
    });
    expect(meta.description).toBe('Sân 300.000₫ · Mỗi suất 100.000₫ — mở để lấy mã QR.');
  });

  it('other expense card has no names', () => {
    const snapshot = snap();
    const expense = exp({
      description: 'Ăn tối',
      amount: 860000,
      shares: [
        { participantId: 'p1', amount: 215000, inputValue: 1 },
        { participantId: 'p2', amount: 215000, inputValue: 1 },
        { participantId: 'p3', amount: 215000, inputValue: 1 },
        { participantId: 'p4', amount: 215000, inputValue: 1 },
      ],
    });
    const meta = pageMeta({
      kind: 'expense',
      snapshot,
      expense,
      now: NOW,
    });
    expect(meta.description).toBe('860.000₫ · chia 4 người — mở để xem phần của bạn.');
    for (const person of snapshot.people) {
      expect(meta.title).not.toContain(person.name);
      expect(meta.description).not.toContain(person.name);
    }
  });

  it('cuts long text', () => {
    const longTripName = 'Đà Lạt '.repeat(20);
    const groupMeta = pageMeta({
      kind: 'group',
      snapshot: snap({ trip: { name: longTripName } }),
      now: NOW,
    });
    expect(groupMeta.title.length).toBeLessThanOrEqual(90);
    expect(groupMeta.title.endsWith('…')).toBe(true);
    expect(groupMeta.description.length).toBeLessThanOrEqual(200);

    const expenseMeta = pageMeta({
      kind: 'expense',
      snapshot: snap({ trip: { name: longTripName } }),
      expense: exp({ description: 'Ăn tối cùng nhóm bạn thân '.repeat(10) }),
      now: NOW,
    });
    expect(expenseMeta.title.length).toBeLessThanOrEqual(90);
    expect(expenseMeta.title.endsWith('…')).toBe(true);
    expect(expenseMeta.description.length).toBeLessThanOrEqual(200);
  });

  it('vi and en have the same keys', () => {
    expect(Object.keys(OG_TEXT.vi).sort()).toEqual(Object.keys(OG_TEXT.en).sort());
  });
});
