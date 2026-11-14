import { describe, expect, it } from 'vitest';
import { applySession, attendanceLabels, newScore, type AttendanceScore, type AttendanceSession } from '../src/index';

const direct = (rootId: string, spentOn: string, bill: Record<string, number>): AttendanceSession => ({
  rootId,
  spentOn,
  planned: false,
  planIds: [],
  bill: Object.entries(bill).map(([participantId, slots]) => ({ participantId, slots })),
});

describe('attendance final-review fixes', () => {
  it('lastBack requires prev.presenceSkipStreak >= 1: two joins in a row from presence 10 -> second session lastBack false; a join after >=1 skip while <=20 -> true', () => {
    const start = new Map<string, AttendanceScore>([
      [
        'a',
        {
          ...newScore('a'),
          presence: 10,
          presenceSkipStreak: 3,
          sessionsSeen: 6,
        },
      ],
    ]);

    // First join after >=1 skip while presence <= 20 -> lastBack is true.
    const afterFirst = applySession(start, direct('r1', '2026-11-01', { a: 1 }), new Set(['a']));
    const firstScore = afterFirst.get('a')!;
    expect(firstScore.lastBack).toBe(true);
    expect(firstScore.lastReturnGap).toBe(3);
    expect(firstScore.presence).toBeLessThanOrEqual(20);
    expect(firstScore.presenceSkipStreak).toBe(0);
    expect(attendanceLabels(firstScore, { latestRootId: 'r1', topGuestId: null })).toContain('back');

    // Second join in a row from low presence (still <= 20, but presenceSkipStreak is now 0) -> lastBack is false.
    const afterSecond = applySession(afterFirst, direct('r2', '2026-11-08', { a: 1 }), new Set(['a']));
    const secondScore = afterSecond.get('a')!;
    expect(secondScore.lastBack).toBe(false);
    expect(secondScore.lastReturnGap).toBe(0);
    expect(attendanceLabels(secondScore, { latestRootId: 'r2', topGuestId: null })).not.toContain('back');

    // Skip one session while still <= 20, then join again -> lastBack is true again.
    const afterSkip = applySession(
      new Map([['a', { ...secondScore, presence: 18 }]]),
      direct('r3', '2026-11-15', {}),
      new Set(['a']),
    );
    expect(afterSkip.get('a')!.presenceSkipStreak).toBe(1);
    expect(afterSkip.get('a')!.presence).toBeLessThanOrEqual(20);

    const afterRejoin = applySession(afterSkip, direct('r4', '2026-11-22', { a: 1 }), new Set(['a']));
    expect(afterRejoin.get('a')!.lastBack).toBe(true);
    expect(afterRejoin.get('a')!.lastReturnGap).toBe(1);
  });
});
