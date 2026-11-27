import { describe, expect, it } from 'vitest';
import {
  planRuleRun,
  upcomingOccurrences,
  type RecurringDraft,
  type RecurringSchedule,
} from '../recurring';
import type { RecurringRuleView } from '../api-types';

const sampleDraft: RecurringDraft = {
  type: 'expense',
  walletId: 'w1',
  amount: 250_000,
  categoryId: 'c1',
  tags: [],
  note: 'Internet',
};

describe('recurring run planning', () => {
  it('records each missed date once', () => {
    const schedule: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay: 5,
      startDate: '2027-01-05',
      end: { kind: 'never' },
    };
    const plan = planRuleRun({
      rule: {
        schedule,
        askMe: false,
        status: 'active',
        nextDueOn: '2027-01-05',
        lastConfirmedOn: '2027-01-01',
      },
      today: '2027-03-06',
      waitingOccurrences: 0,
      openCheckIn: null,
      maxOccurrences: 31,
    });

    expect(plan).toEqual({
      record: ['2027-01-05', '2027-02-05', '2027-03-05'],
      wait: [],
      nextDueOn: '2027-04-05',
      openCheckIn: false,
      pause: null,
    });
  });

  it('nothing before due', () => {
    const schedule: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay: 5,
      startDate: '2027-01-05',
      end: { kind: 'never' },
    };
    const plan = planRuleRun({
      rule: {
        schedule,
        askMe: false,
        status: 'active',
        nextDueOn: '2027-01-05',
        lastConfirmedOn: '2027-01-01',
      },
      today: '2027-01-04',
      waitingOccurrences: 0,
      openCheckIn: null,
      maxOccurrences: 31,
    });

    expect(plan).toEqual({
      record: [],
      wait: [],
      nextDueOn: '2027-01-05',
      openCheckIn: false,
      pause: null,
    });
  });

  it('ask me waits', () => {
    const schedule: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay: 5,
      startDate: '2027-01-05',
      end: { kind: 'never' },
    };
    const plan = planRuleRun({
      rule: {
        schedule,
        askMe: true,
        status: 'active',
        nextDueOn: '2027-01-05',
        lastConfirmedOn: '2027-01-01',
      },
      today: '2027-01-05',
      waitingOccurrences: 0,
      openCheckIn: null,
      maxOccurrences: 31,
    });

    expect(plan).toEqual({
      record: [],
      wait: ['2027-01-05'],
      nextDueOn: '2027-02-05',
      openCheckIn: false,
      pause: null,
    });
  });

  it('yearly waits', () => {
    const schedule: RecurringSchedule = {
      unit: 'year',
      every: 1,
      startDate: '2027-01-05',
      end: { kind: 'never' },
    };
    const plan = planRuleRun({
      rule: {
        schedule,
        askMe: false,
        status: 'active',
        nextDueOn: '2027-01-05',
        lastConfirmedOn: '2027-01-01',
      },
      today: '2027-01-05',
      waitingOccurrences: 0,
      openCheckIn: null,
      maxOccurrences: 31,
    });

    expect(plan).toEqual({
      record: [],
      wait: ['2027-01-05'],
      nextDueOn: '2028-01-05',
      openCheckIn: false,
      pause: null,
    });
  });

  it('third waiting pauses', () => {
    const schedule: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay: 5,
      startDate: '2027-01-05',
      end: { kind: 'never' },
    };
    const plan = planRuleRun({
      rule: {
        schedule,
        askMe: true,
        status: 'active',
        nextDueOn: '2027-03-05',
        lastConfirmedOn: '2027-01-01',
      },
      today: '2027-03-05',
      waitingOccurrences: 2,
      openCheckIn: null,
      maxOccurrences: 31,
    });

    expect(plan).toEqual({
      record: [],
      wait: ['2027-03-05'],
      nextDueOn: '2027-04-05',
      openCheckIn: false,
      pause: 'waiting',
    });
  });

  it('check-in opens after 6 months for monthly', () => {
    const schedule: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay: 5,
      startDate: '2027-01-05',
      end: { kind: 'never' },
    };
    const plan = planRuleRun({
      rule: {
        schedule,
        askMe: false,
        status: 'active',
        nextDueOn: '2027-07-05',
        lastConfirmedOn: '2027-01-01',
      },
      today: '2027-07-05',
      waitingOccurrences: 0,
      openCheckIn: null,
      maxOccurrences: 31,
    });

    expect(plan).toEqual({
      record: ['2027-07-05'],
      wait: [],
      nextDueOn: '2027-08-05',
      openCheckIn: true,
      pause: null,
    });
  });

  it('check-in grace pauses monthly after 3 more', () => {
    const schedule: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay: 5,
      startDate: '2027-01-05',
      end: { kind: 'never' },
    };
    const plan = planRuleRun({
      rule: {
        schedule,
        askMe: false,
        status: 'active',
        nextDueOn: '2027-10-05',
        lastConfirmedOn: '2027-01-01',
      },
      today: '2027-10-05',
      waitingOccurrences: 0,
      openCheckIn: { createdOn: '2027-07-05', occurrencesSince: 3 },
      maxOccurrences: 31,
    });

    expect(plan).toEqual({
      record: [],
      wait: [],
      nextDueOn: '2027-10-05',
      openCheckIn: false,
      pause: 'checkin',
    });
  });

  it('check-in grace still records the third occurrence', () => {
    const schedule: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay: 5,
      startDate: '2027-01-05',
      end: { kind: 'never' },
    };
    const plan = planRuleRun({
      rule: { schedule, askMe: false, status: 'active', nextDueOn: '2027-09-05', lastConfirmedOn: '2027-01-01' },
      today: '2027-10-05',
      waitingOccurrences: 0,
      openCheckIn: { createdOn: '2027-07-05', occurrencesSince: 2 },
      maxOccurrences: 31,
    });

    expect(plan).toEqual({
      record: ['2027-09-05'],
      wait: [],
      nextDueOn: '2027-10-05',
      openCheckIn: false,
      pause: 'checkin',
    });
  });

  it('daily grace is 14 days', () => {
    const schedule: RecurringSchedule = {
      unit: 'day',
      every: 1,
      startDate: '2026-12-01',
      end: { kind: 'never' },
    };
    const plan = planRuleRun({
      rule: {
        schedule,
        askMe: false,
        status: 'active',
        nextDueOn: '2027-01-16',
        lastConfirmedOn: '2026-12-01',
      },
      today: '2027-01-16',
      waitingOccurrences: 0,
      openCheckIn: { createdOn: '2027-01-01', occurrencesSince: 14 },
      maxOccurrences: 31,
    });

    expect(plan).toEqual({
      record: [],
      wait: [],
      nextDueOn: '2027-01-16',
      openCheckIn: false,
      pause: 'checkin',
    });
  });

  it('respects maxOccurrences', () => {
    const schedule: RecurringSchedule = {
      unit: 'day',
      every: 1,
      startDate: '2027-01-01',
      end: { kind: 'never' },
    };
    const plan = planRuleRun({
      rule: {
        schedule,
        askMe: false,
        status: 'active',
        nextDueOn: '2027-01-01',
        lastConfirmedOn: '2027-02-09',
      },
      today: '2027-02-09',
      waitingOccurrences: 0,
      openCheckIn: null,
      maxOccurrences: 31,
    });

    expect(plan.record).toHaveLength(31);
    expect(plan.record[0]).toBe('2027-01-01');
    expect(plan.record[30]).toBe('2027-01-31');
    expect(plan.nextDueOn).toBe('2027-02-01');
    expect(plan.pause).toBeNull();
  });

  it('ended schedule sets nextDueOn to null', () => {
    const schedule: RecurringSchedule = {
      unit: 'month',
      every: 1,
      monthDay: 5,
      startDate: '2027-01-05',
      end: { kind: 'count', count: 2 },
    };
    const plan = planRuleRun({
      rule: {
        schedule,
        askMe: false,
        status: 'active',
        nextDueOn: '2027-01-05',
        lastConfirmedOn: '2027-01-01',
      },
      today: '2027-02-10',
      waitingOccurrences: 0,
      openCheckIn: null,
      maxOccurrences: 31,
    });

    expect(plan).toEqual({
      record: ['2027-01-05', '2027-02-05'],
      wait: [],
      nextDueOn: null,
      openCheckIn: false,
      pause: null,
    });
  });

  it('upcomingOccurrences lists active rules only, in date order, approximate true for askMe', () => {
    const rules: RecurringRuleView[] = [
      {
        id: 'r-active-ask',
        draft: { ...sampleDraft, amount: 500_000, note: 'Electric' },
        schedule: {
          unit: 'month',
          every: 1,
          monthDay: 10,
          startDate: '2027-01-10',
          end: { kind: 'never' },
        },
        askMe: true,
        status: 'active',
        pausedReason: null,
        nextDueOn: '2027-01-10',
        lastConfirmedOn: '2027-01-01',
      },
      {
        id: 'r-active-auto',
        draft: sampleDraft,
        schedule: {
          unit: 'week',
          every: 1,
          weekdays: [3], // Wed
          startDate: '2027-01-06',
          end: { kind: 'never' },
        },
        askMe: false,
        status: 'active',
        pausedReason: null,
        nextDueOn: '2027-01-06',
        lastConfirmedOn: '2027-01-01',
      },
      {
        id: 'r-paused',
        draft: sampleDraft,
        schedule: {
          unit: 'day',
          every: 1,
          startDate: '2027-01-01',
          end: { kind: 'never' },
        },
        askMe: false,
        status: 'paused',
        pausedReason: 'manual',
        nextDueOn: '2027-01-02',
        lastConfirmedOn: '2027-01-01',
      },
      {
        id: 'r-ended',
        draft: sampleDraft,
        schedule: {
          unit: 'day',
          every: 1,
          startDate: '2027-01-01',
          end: { kind: 'count', count: 1 },
        },
        askMe: false,
        status: 'ended',
        pausedReason: null,
        nextDueOn: null,
        lastConfirmedOn: '2027-01-01',
      },
    ];

    const items = upcomingOccurrences(rules, '2027-01-01', 14);
    expect(items.map((i) => ({ ruleId: i.ruleId, date: i.date, approximate: i.approximate }))).toEqual([
      { ruleId: 'r-active-auto', date: '2027-01-06', approximate: false },
      { ruleId: 'r-active-ask', date: '2027-01-10', approximate: true },
      { ruleId: 'r-active-auto', date: '2027-01-13', approximate: false },
    ]);
  });
});
