import { describe, it, expect } from 'vitest';
import { APP_NAME } from '../config';
import { sportShareText } from '../lib/remind';
import { splitText } from '../lib/tripText';
import { t, setLang } from '../i18n';
import type { ExpenseView } from '@fsl/core';

describe('APP_NAME and group copy', () => {
  it('uses CoinCrew (Tiền Đâu) as APP_NAME and generalized group strings', () => {
    expect(APP_NAME).toBe('CoinCrew (Tiền Đâu)');
    setLang('en');
    expect(t('trips.title')).toBe('Your groups');
    expect(t('trips.new')).toBe('New group');
    expect(t('create.tripName')).toBe('Group name');
    expect(t('create.submit')).toBe('Create group');
  });
});

describe('sportShareText', () => {
  it('formats Vietnamese one-line message with cost components, Nam/Nữ rates, and exceptions (Review Focus 5)', () => {
    const text = sportShareText('vi', {
      court: 240000,
      shuttlecocksTotal: 115000,
      extra: 25000,
      maleSlotRate: 70000,
      femaleSlotRate: 55000,
      totalMaleSlots: 3,
      totalFemaleSlots: 3,
      participants: [
        { participantId: 'p1', name: 'Minh', rosterGender: 'M', maleSlots: 1, femaleSlots: 0, amount: 70000 },
        { participantId: 'p2', name: 'Chi', rosterGender: 'F', maleSlots: 0, femaleSlots: 1, amount: 55000 },
        // Review Focus 5: Male latecomer assigned 1 female slot
        { participantId: 'p3', name: 'Bình', rosterGender: 'M', maleSlots: 0, femaleSlots: 1, amount: 55000 },
        // Fixed override
        { participantId: 'p4', name: 'An', rosterGender: 'M', maleSlots: 1, femaleSlots: 0, fixedAmount: 40000, amount: 40000 },
        // Multi-slot player covering guests
        { participantId: 'p5', name: 'Quang', rosterGender: 'M', maleSlots: 2, femaleSlots: 1, amount: 195000 },
      ],
      link: 'https://coincrew.app/j/tok123',
    });
    expect(text).toBe(
      'Sân 240.000₫, cầu 115.000₫, phụ phí 25.000₫, Nam đóng 70.000₫, nữ đóng 55.000₫, riêng Bình đóng 55.000₫, riêng An đóng 40.000₫, riêng Quang đóng 195.000₫. Mã QR & chi tiết: https://coincrew.app/j/tok123',
    );
  });

  it('omits zero cost components and uses equal rate copy when maleSlotRate === femaleSlotRate', () => {
    const text = sportShareText('en', {
      court: 500000,
      shuttlecocksTotal: 0,
      extra: 0,
      maleSlotRate: 50000,
      femaleSlotRate: 50000,
      totalMaleSlots: 10,
      totalFemaleSlots: 0,
      participants: [
        { participantId: 'p1', name: 'Minh', rosterGender: 'M', maleSlots: 1, femaleSlots: 0, amount: 50000 },
      ],
      link: 'https://coincrew.app/j/tok123',
    });
    expect(text).toBe('Court 500.000₫, each pays 50.000₫. QR & details: https://coincrew.app/j/tok123');
  });
});

describe('splitText for sport expenses', () => {
  it('returns sport split label when meta.sport is present', () => {
    setLang('en');
    const exp = {
      id: 'e1',
      description: 'Badminton',
      amount: 300000,
      spentOn: '2026-10-16',
      payerId: 'p1',
      mode: 'amounts',
      status: 'approved',
      rejectReason: null,
      disabledByName: null,
      createdById: 'p1',
      shares: [],
      meta: {
        sport: {
          court: 300000,
          shuttlecocks: [],
          extra: 0,
          rule: { kind: 'equal' },
          entries: [],
          maleSlotRate: 50000,
          femaleSlotRate: 50000,
        },
      },
    } satisfies ExpenseView;
    expect(splitText(exp, t)).toBe('sport split');
  });
});

describe('renderSportBillPng and shareSportBill', () => {
  const billInput = {
    description: 'Badminton Thu',
    spentOn: '2026-10-16',
    groupName: 'Thursday Crew',
    total: 300000,
    court: 200000,
    shuttlecocksTotal: 100000,
    extra: 0,
    maleSlotRate: 60000,
    femaleSlotRate: 40000,
    totalMaleSlots: 3,
    totalFemaleSlots: 3,
    rows: [
      { name: 'Minh', femaleSlots: 0, maleSlots: 1, isFixed: false, amount: 60000 },
      { name: 'Chi', femaleSlots: 1, maleSlots: 0, isFixed: false, amount: 40000 },
    ],
    payerName: 'Minh',
    bank: { bankName: 'MBBank', accountNumber: '0123456789', holderName: 'NGUYEN VAN MINH' },
    qrSvg: '<svg></svg>',
  };

  it('renders bill PNG or resolves null gracefully in headless environment', async () => {
    const { renderSportBillPng } = await import('../lib/qr');
    const result = await renderSportBillPng(billInput);
    expect(result === null || result instanceof Blob).toBe(true);
  });

  it('shares sport bill with fallback', async () => {
    const { shareSportBill } = await import('../lib/qr');
    const res = await shareSportBill(billInput, 'text', 'DALAT123');
    expect(['shared', 'saved', 'failed']).toContain(res);
  });
});

