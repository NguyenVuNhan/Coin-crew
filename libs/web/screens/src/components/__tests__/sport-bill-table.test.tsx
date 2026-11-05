import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TripView, ExpenseView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import { sportBillCalc } from '../../lib/sportBill';
import { SportBillTable } from '../SportBillTable';

const baseSportTripView: TripView = {
  trip: {
    id: 't-sport',
    name: 'Cầu lông T5',
    currency: 'VND',
    preset: 'sport',
    fewestTransfers: true,
    archived: false,
    version: 1,
    total: 380000,
  },
  me: { kind: 'member', participantId: 'p-minh', participantPending: false, isOrganiser: true },
  people: [
    { id: 'p-minh', name: 'Minh', status: 'active', isMember: true, isOrganiser: true, bank: 'none', gender: 'M' },
    { id: 'p-an', name: 'An', status: 'active', isMember: false, isOrganiser: false, bank: 'none', gender: 'M' },
    { id: 'p-chi', name: 'Chi', status: 'active', isMember: false, isOrganiser: false, bank: 'none', gender: 'F' },
    { id: 'p-binh', name: 'Bình', status: 'active', isMember: false, isOrganiser: false, bank: 'none', gender: 'M' },
  ],
  balances: { 'p-minh': 0, 'p-an': 0, 'p-chi': 0, 'p-binh': 0 },
  suggestions: [],
  expenses: [],
  payments: [],
  myBalance: { now: 0, beforePayments: 0, ifPendingApproved: null, waitingConfirm: 0 },
  approvals: [],
  links: { group: 'gtok-sport', view: 'vtok-sport' },
};

const sportExpense380k: ExpenseView = {
  id: 'e-sport-1',
  description: 'Badminton Session',
  amount: 380000,
  spentOn: '2026-11-05',
  payerId: 'p-minh',
  mode: 'amounts',
  status: 'approved',
  rejectReason: null,
  disabledByName: null,
  createdById: 'p-minh',
  shares: [
    { participantId: 'p-minh', amount: 113334, inputValue: 113334 },
    { participantId: 'p-an', amount: 113333, inputValue: 113333 },
    { participantId: 'p-chi', amount: 98333, inputValue: 98333 },
    { participantId: 'p-binh', amount: 55000, inputValue: 55000 },
  ],
  meta: {
    sport: {
      court: 240000,
      shuttlecocks: [{ qty: 5, unitPrice: 23000 }],
      extra: 25000,
      rule: { kind: 'discount', femaleDiscount: 15000 },
      entries: [
        { participantId: 'p-minh', maleSlots: 1, femaleSlots: 0 },
        { participantId: 'p-an', maleSlots: 1, femaleSlots: 0 },
        { participantId: 'p-chi', maleSlots: 0, femaleSlots: 1 },
        { participantId: 'p-binh', maleSlots: 1, femaleSlots: 0, fixedAmount: 55000 },
      ],
      maleSlotRate: 113333,
      femaleSlotRate: 98333,
    },
  },
};

const nonSportExpense: ExpenseView = {
  id: 'e-normal-1',
  description: 'Drinks',
  amount: 50000,
  spentOn: '2026-11-05',
  payerId: 'p-minh',
  mode: 'equal',
  status: 'approved',
  rejectReason: null,
  disabledByName: null,
  createdById: 'p-minh',
  shares: [
    { participantId: 'p-minh', amount: 25000, inputValue: null },
    { participantId: 'p-an', amount: 25000, inputValue: null },
  ],
};

describe('SportBillTable and sportBillCalc', () => {
  it('sportBillCalc returns null for a bill without sport details', () => {
    expect(sportBillCalc(baseSportTripView, nonSportExpense)).toBeNull();
  });

  it("sportBillCalc keeps today's numbers", () => {
    const calc = sportBillCalc(baseSportTripView, sportExpense380k);
    expect(calc).not.toBeNull();
    expect(calc?.court).toBe(240000);
    expect(calc?.shuttlecocksTotal).toBe(115000);
    expect(calc?.extra).toBe(25000);
    expect(calc?.totalMaleSlots).toBe(2);
    expect(calc?.totalFemaleSlots).toBe(1);
    expect(calc?.maleSlotRate).toBe(113333);
    expect(calc?.femaleSlotRate).toBe(98333);
    expect(calc?.participants).toEqual([
      {
        participantId: 'p-minh',
        name: 'Minh',
        rosterGender: 'M',
        maleSlots: 1,
        femaleSlots: 0,
        fixedAmount: null,
        amount: 113334,
      },
      {
        participantId: 'p-an',
        name: 'An',
        rosterGender: 'M',
        maleSlots: 1,
        femaleSlots: 0,
        fixedAmount: null,
        amount: 113333,
      },
      {
        participantId: 'p-chi',
        name: 'Chi',
        rosterGender: 'F',
        maleSlots: 0,
        femaleSlots: 1,
        fixedAmount: null,
        amount: 98333,
      },
      {
        participantId: 'p-binh',
        name: 'Bình',
        rosterGender: 'M',
        maleSlots: 1,
        femaleSlots: 0,
        fixedAmount: 55000,
        amount: 55000,
      },
    ]);
  });

  it('the table lists every player with slots and amounts', () => {
    setLang('en');
    const calc = sportBillCalc(baseSportTripView, sportExpense380k)!;
    render(<SportBillTable calc={calc} total={sportExpense380k.amount} meId="p-minh" />);

    expect(screen.getByText('Minh (you)')).toBeInTheDocument();
    expect(screen.getByText('An')).toBeInTheDocument();
    expect(screen.getByText('Chi')).toBeInTheDocument();
    expect(screen.getByText('Bình')).toBeInTheDocument();

    expect(screen.getByText('113.334₫')).toBeInTheDocument();
    expect(screen.getAllByText('113.333₫').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('98.333₫').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('55.000₫')).toBeInTheDocument();

    expect(screen.getByText('(Fixed)')).toBeInTheDocument();
  });

  it('the costs row shows the summary and the total', () => {
    setLang('en');
    const calc = sportBillCalc(baseSportTripView, sportExpense380k)!;
    render(<SportBillTable calc={calc} total={sportExpense380k.amount} meId="p-minh" />);

    expect(
      screen.getByText('Court: 240.000₫ · Shuttlecocks: 115.000₫ · Extra fee (water, parking…): 25.000₫'),
    ).toBeInTheDocument();
    expect(screen.getByText('380.000₫')).toBeInTheDocument();
  });

  it('the per-slot row shows both rates in one cell', () => {
    setLang('en');
    const calc = sportBillCalc(baseSportTripView, sportExpense380k)!;
    const { container } = render(<SportBillTable calc={calc} total={sportExpense380k.amount} meId="p-minh" />);

    const perSlotRow = container.querySelector('.fsl-sport-table__row--per-slot');
    expect(perSlotRow).not.toBeNull();

    const cells = perSlotRow!.querySelectorAll('td');
    expect(cells).toHaveLength(1);
    const td = cells[0]!;
    expect(td).toHaveAttribute('colspan', '3');
    expect(td).toHaveClass('fsl-sport-table__col--right', 'text-right', 'tabular-nums');
    expect(td.textContent).toContain('F');
    expect(td.textContent).toContain('98.333₫');
    expect(td.textContent).toContain('M');
    expect(td.textContent).toContain('113.333₫');
  });

  it('has no sideways scroll container and wraps names', () => {
    setLang('en');
    const calc = sportBillCalc(baseSportTripView, sportExpense380k)!;
    const { container } = render(<SportBillTable calc={calc} total={sportExpense380k.amount} meId="p-minh" />);

    expect(container.querySelector('.overflow-x-auto')).toBeNull();

    const table = container.querySelector('table.fsl-sport-table');
    expect(table).not.toBeNull();
    expect(table).toHaveClass('table-fixed');

    const nameCells = container.querySelectorAll('tbody tr td:first-child');
    expect(nameCells.length).toBe(4);
    nameCells.forEach((cell) => {
      expect(cell).toHaveClass('break-words');
    });
  });
});
