import { describe, it, expect } from 'vitest';
import { newScore, turnoutEstimate, type AttendanceScore } from '../src/index';

const score = (over: Partial<AttendanceScore>): AttendanceScore => ({
  ...newScore('p'),
  sessionsSeen: 10,
  sessionsPlanned: 10,
  ...over,
});

describe('turnoutEstimate flaky bucket', () => {
  it('counts low reliability as flaky only after enough planned sessions', () => {
    const scores = new Map([['p', score({ participantId: 'p', reliability: 40, sessionsPlanned: 5 })]]);
    expect(turnoutEstimate([{ participantId: 'p', slots: 2 }], scores)).toMatchObject({ flaky: 2, unsure: 0, sure: 0 });
  });

  it('puts low reliability with too few planned sessions into unsure', () => {
    const scores = new Map([['p', score({ participantId: 'p', reliability: 40, sessionsPlanned: 4 })]]);
    expect(turnoutEstimate([{ participantId: 'p', slots: 2 }], scores)).toMatchObject({ flaky: 0, unsure: 2, sure: 0 });
  });

  it('keeps 51-74 in unsure and 75+ in sure', () => {
    const scores = new Map([
      ['a', score({ participantId: 'a', reliability: 60 })],
      ['b', score({ participantId: 'b', reliability: 75 })],
    ]);
    const r = turnoutEstimate(
      [
        { participantId: 'a', slots: 1 },
        { participantId: 'b', slots: 3 },
      ],
      scores,
    );
    expect(r).toMatchObject({ sure: 3, unsure: 1, flaky: 0 });
  });
});
