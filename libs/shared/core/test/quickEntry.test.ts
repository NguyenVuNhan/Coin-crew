import { describe, it, expect } from 'vitest';
import {
  recentDirectPeopleIds,
  owedLines,
  quickExpenseDescription,
  timeBand,
  amountBand,
  guessExpenseCategory,
  type GuessEntry,
  type GuessPersonRow,
} from '../src';
import type { ExpenseView, PaymentView, PersonView, TripView } from '../src/api-types';

function makePerson(id: string, overrides: Partial<PersonView> = {}): PersonView {
  return {
    id,
    name: id,
    status: 'active',
    isMember: true,
    bank: 'none',
    ...overrides,
  };
}

function makeExpense(overrides: Partial<ExpenseView> = {}): ExpenseView {
  return {
    id: 'exp-1',
    description: 'Lunch',
    amount: 50_000,
    spentOn: '2026-11-20',
    payerId: 'me',
    mode: 'equal',
    status: 'approved',
    rejectReason: null,
    disabledByName: null,
    createdById: 'me',
    createdAt: '2026-11-20T12:00:00.000Z',
    shares: [],
    ...overrides,
  };
}

function makePayment(overrides: Partial<PaymentView> = {}): PaymentView {
  return {
    id: 'pay-1',
    fromId: 'minh',
    toId: 'me',
    amountClaimed: 50_000,
    amountConfirmed: 50_000,
    status: 'confirmed',
    notArrived: false,
    createdAt: '2026-11-20T12:00:00.000Z',
    disabledByName: null,
    ...overrides,
  };
}

function makeGuessEntry(overrides: Partial<GuessEntry> = {}): GuessEntry {
  return {
    categoryId: 'cat-coffee',
    type: 'expense',
    amount: 45_000,
    date: '2026-11-20',
    time: '08:00',
    createdAt: '2026-11-20T01:00:00.000Z',
    ...overrides,
  };
}

describe('quickEntry', () => {
  describe('recentDirectPeopleIds', () => {
    it('returns people from latest-createdAt expenses and payments newest first, excluding me and non-active, without duplicates, padded and cut to limit', () => {
      const view: Pick<TripView, 'people' | 'expenses' | 'payments'> = {
        people: [
          makePerson('me'),
          makePerson('an'),
          makePerson('binh', { status: 'pending' }),
          makePerson('chi'),
          makePerson('dung', { status: 'left' }),
          makePerson('lan'),
          makePerson('minh'),
          makePerson('nam'),
        ],
        expenses: [
          makeExpense({
            id: 'e-old',
            createdAt: '2026-11-18T10:00:00.000Z',
            payerId: 'an',
            shares: [
              { participantId: 'me', amount: 25_000, inputValue: 1 },
              { participantId: 'an', amount: 25_000, inputValue: 1 },
              { participantId: 'binh', amount: 25_000, inputValue: 1 },
            ],
          }),
          makeExpense({
            id: 'e-new',
            createdAt: '2026-11-20T10:00:00.000Z',
            payerId: 'me',
            shares: [
              { participantId: 'me', amount: 25_000, inputValue: 1 },
              { participantId: 'minh', amount: 25_000, inputValue: 1 },
              { participantId: 'dung', amount: 25_000, inputValue: 1 },
            ],
          }),
        ],
        payments: [
          makePayment({
            id: 'p-newest',
            createdAt: '2026-11-21T09:00:00.000Z',
            fromId: 'lan',
            toId: 'me',
          }),
          makePayment({
            id: 'p-dup',
            createdAt: '2026-11-19T09:00:00.000Z',
            fromId: 'me',
            toId: 'minh',
          }),
        ],
      };

      expect(recentDirectPeopleIds(view, 'me')).toEqual(['lan', 'minh', 'an', 'chi']);
      expect(recentDirectPeopleIds(view, 'me', 5)).toEqual(['lan', 'minh', 'an', 'chi', 'nam']);
      expect(recentDirectPeopleIds(view, 'me', 2)).toEqual(['lan', 'minh']);
    });
  });

  describe('owedLines', () => {
    it('computes shared 50k with payer me', () => {
      expect(
        owedLines(
          [
            { participantId: 'me', amount: 25_000 },
            { participantId: 'minh', amount: 25_000 },
          ],
          'me',
          'me',
        ),
      ).toEqual({
        myShare: 25_000,
        lines: [{ personId: 'minh', amount: 25_000, direction: 'owesMe' }],
      });
    });

    it('computes shared 50k with payer Minh', () => {
      expect(
        owedLines(
          [
            { participantId: 'me', amount: 25_000 },
            { participantId: 'minh', amount: 25_000 },
          ],
          'minh',
          'me',
        ),
      ).toEqual({
        myShare: 25_000,
        lines: [{ personId: 'minh', amount: 25_000, direction: 'iOwe' }],
      });
    });

    it('computes loan with shares Minh 50k only and payer me', () => {
      expect(
        owedLines([{ participantId: 'minh', amount: 50_000 }], 'me', 'me'),
      ).toEqual({
        myShare: 0,
        lines: [{ personId: 'minh', amount: 50_000, direction: 'owesMe' }],
      });
    });

    it('computes borrowed with shares me 50k and payer Minh', () => {
      expect(
        owedLines([{ participantId: 'me', amount: 50_000 }], 'minh', 'me'),
      ).toEqual({
        myShare: 50_000,
        lines: [{ personId: 'minh', amount: 50_000, direction: 'iOwe' }],
      });
    });
  });

  describe('quickExpenseDescription', () => {
    it('uses fallback when note is whitespace', () => {
      expect(quickExpenseDescription({ note: '  ', fallback: 'Cà phê' })).toBe('Cà phê');
    });

    it('cuts a 100-character note to its first 80 characters, trimmed', () => {
      const note = 'a'.repeat(100);
      expect(quickExpenseDescription({ note, fallback: 'Cà phê' })).toBe('a'.repeat(80));
    });
  });

  describe('timeBand', () => {
    it('maps hours to bands', () => {
      expect(timeBand(4)).toBe('night');
      expect(timeBand(5)).toBe('morning');
      expect(timeBand(13)).toBe('midday');
      expect(timeBand(22)).toBe('evening');
      expect(timeBand(23)).toBe('night');
    });
  });

  describe('amountBand', () => {
    it('maps VND amounts to bands', () => {
      expect(amountBand(49_999)).toBe('small');
      expect(amountBand(50_000)).toBe('medium');
      expect(amountBand(1_000_000)).toBe('huge');
    });
  });

  describe('guessExpenseCategory', () => {
    const now = new Date(2026, 10, 21, 8, 30, 0);

    it('prefers the newest category used with the same person over the band rule', () => {
      const personRows: GuessPersonRow[] = [
        { personNames: ['Minh'], categoryId: 'cat-old', activityAt: '2026-11-01T10:00:00.000Z' },
        { personNames: ['Lan', 'Minh'], categoryId: 'cat-food', activityAt: '2026-11-19T10:00:00.000Z' },
        { personNames: ['An'], categoryId: 'cat-other', activityAt: '2026-11-21T10:00:00.000Z' },
      ];
      const entries: GuessEntry[] = [
        makeGuessEntry({ categoryId: 'cat-coffee', date: '2026-11-19', time: '08:00' }),
        makeGuessEntry({ categoryId: 'cat-coffee', date: '2026-11-20', time: '08:15' }),
      ];

      expect(
        guessExpenseCategory({
          entries,
          personRows,
          personNames: ['Minh'],
          amount: 45_000,
          now,
        }),
      ).toBe('cat-food');
    });

    it('picks the most used expense category in the same time and amount band within 90 days (min 2 matches), breaking ties by most recent', () => {
      const entries: GuessEntry[] = [
        makeGuessEntry({ categoryId: 'cat-food', date: '2026-11-10', time: '07:00', createdAt: '2026-11-10T00:00:00.000Z' }),
        makeGuessEntry({ categoryId: 'cat-food', date: '2026-11-12', time: '07:30', createdAt: '2026-11-12T00:30:00.000Z' }),
        makeGuessEntry({ categoryId: 'cat-coffee', date: '2026-11-15', time: '08:00', createdAt: '2026-11-15T01:00:00.000Z' }),
        makeGuessEntry({ categoryId: 'cat-coffee', date: '2026-11-20', time: '08:15', createdAt: '2026-11-20T01:15:00.000Z' }),
        // income should be ignored
        makeGuessEntry({ type: 'income', categoryId: 'cat-salary', date: '2026-11-18', time: '08:00' }),
        makeGuessEntry({ type: 'income', categoryId: 'cat-salary', date: '2026-11-19', time: '08:00' }),
        makeGuessEntry({ type: 'income', categoryId: 'cat-salary', date: '2026-11-20', time: '08:00' }),
      ];

      expect(
        guessExpenseCategory({
          entries,
          personRows: [],
          personNames: [],
          amount: 45_000,
          now,
        }),
      ).toBe('cat-coffee');
    });

    it('uses the local hour of createdAt when time is null', () => {
      const localMorning1 = new Date(2026, 10, 18, 7, 15, 0).toISOString();
      const localMorning2 = new Date(2026, 10, 19, 8, 45, 0).toISOString();
      const entries: GuessEntry[] = [
        makeGuessEntry({ categoryId: 'cat-coffee', date: '2026-11-18', time: null, createdAt: localMorning1 }),
        makeGuessEntry({ categoryId: 'cat-coffee', date: '2026-11-19', time: null, createdAt: localMorning2 }),
      ];

      expect(
        guessExpenseCategory({
          entries,
          personRows: [],
          personNames: [],
          amount: 35_000,
          now,
        }),
      ).toBe('cat-coffee');
    });

    it('ignores entries older than 90 days and returns null with no support', () => {
      const entries: GuessEntry[] = [
        makeGuessEntry({ categoryId: 'cat-coffee', date: '2026-08-01', time: '08:00', createdAt: '2026-08-01T01:00:00.000Z' }),
        makeGuessEntry({ categoryId: 'cat-coffee', date: '2026-08-02', time: '08:00', createdAt: '2026-08-02T01:00:00.000Z' }),
        makeGuessEntry({ categoryId: 'cat-food', date: '2026-11-20', time: '08:00', createdAt: '2026-11-20T01:00:00.000Z' }),
      ];

      expect(
        guessExpenseCategory({
          entries,
          personRows: [],
          personNames: [],
          amount: 45_000,
          now,
        }),
      ).toBeNull();
    });
  });
});
