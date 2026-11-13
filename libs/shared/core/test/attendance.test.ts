import { describe, it, expect } from 'vitest';
import {
  ATTENDANCE,
  applySession,
  attendanceLabels,
  mergeScores,
  newScore,
  skipStep,
  topGuestId,
  turnoutEstimate,
  wantedStamp,
  type AttendanceScore,
  type AttendanceSession,
} from '../src/index';

let n = 0;
const direct = (bill: Record<string, number>): AttendanceSession => ({
  rootId: `r${++n}`,
  spentOn: `2026-01-${String(n).padStart(2, '0')}`,
  planned: false,
  planIds: [],
  bill: Object.entries(bill).map(([participantId, slots]) => ({ participantId, slots })),
});
const planned = (planIds: string[], bill: Record<string, number>): AttendanceSession => ({
  ...direct(bill),
  planned: true,
  planIds,
});
const run = (sessions: AttendanceSession[], active: string[], start = new Map<string, AttendanceScore>()) =>
  sessions.reduce((m, s) => applySession(m, s, new Set(active)), start as ReadonlyMap<string, AttendanceScore>);
const noCtx = { latestRootId: null, topGuestId: null };

describe('attendance formulas', () => {
  it('joins from the start reach regular in 6 sessions', () => {
    let m: ReadonlyMap<string, AttendanceScore> = new Map();
    const presences: number[] = [];
    for (let i = 0; i < 6; i++) {
      m = applySession(m, direct({ a: 1 }), new Set(['a']));
      presences.push(m.get('a')!.presence);
    }
    expect(presences.map(Math.round)).toEqual([36, 43, 52, 62, 71, 79]);
    expect(attendanceLabels(m.get('a')!, noCtx)).toContain('regular');
  });

  it('skips from 80 drop 64 → 45 → 25 → 10', () => {
    let p = 80;
    const out: number[] = [];
    for (let k = 1; k <= 4; k++) {
      p = skipStep(p, k);
      out.push(Math.round(p));
    }
    expect(out).toEqual([64, 45, 25, 10]);
  });

  it('two no-shows in a row make a planned person flaky after 5 plans', () => {
    const m = run(
      [
        planned(['a'], { a: 1 }),
        planned(['a'], { a: 1 }),
        planned(['a'], { a: 1 }),
        planned(['a'], {}),
        planned(['a'], {}),
      ],
      ['a'],
    );
    const a = m.get('a')!;
    expect(a.sessionsPlanned).toBe(5);
    expect(a.reliability).toBeCloseTo(48.4, 1);
    expect(a.reliabilitySkipStreak).toBe(2);
    expect(attendanceLabels(a, noCtx)).toContain('flaky');
  });

  it('walk-in raises presence and leaves reliability alone', () => {
    const m = run([planned(['b'], { a: 1, b: 1 })], ['a', 'b']);
    const a = m.get('a')!;
    expect(a.presence).toBeCloseTo(35.6, 5);
    expect(a.reliability).toBe(80);
    expect(a.sessionsPlanned).toBe(0);
    expect(a.reliabilityJoinStreak).toBe(0);
    expect(m.get('b')!.reliability).toBeCloseTo(81.6, 5);
  });

  it('direct bill (planned=false) never changes reliability', () => {
    const s = { ...direct({ a: 1 }), planIds: ['a', 'b'] };
    const m = run([s], ['a', 'b']);
    expect(m.get('a')!.reliability).toBe(80);
    expect(m.get('b')!.reliability).toBe(80);
    expect(m.get('b')!.presence).toBeCloseTo(24, 5);
    expect(m.get('a')!.sessionsPlanned).toBe(0);
  });

  it('guest score: 0.8·g + brought; slots 3 → brought 2', () => {
    const m = run([direct({ a: 3 }), direct({ a: 1 }), direct({ a: 2 })], ['a']);
    const a = m.get('a')!;
    expect(a.guest).toBeCloseTo((0.8 * 2 + 0) * 0.8 + 1, 10);
    expect(a.guestsTotal).toBe(3);
    expect(a.timesPlayed).toBe(3);
  });

  it('an active tracked person missing from the bill is skipped; one not in `active` is untouched', () => {
    const start = new Map([
      ['b', newScore('b')],
      ['c', newScore('c')],
    ]);
    const before = start.get('c')!;
    const m = run([direct({ a: 1 })], ['a', 'b'], start);
    expect(m.get('b')!.presence).toBeCloseTo(24, 5);
    expect(m.get('b')!.presenceSkipStreak).toBe(1);
    expect(m.get('b')!.sessionsSeen).toBe(1);
    expect(m.get('c')).toBe(before);
    expect(m.get('c')!.sessionsSeen).toBe(0);
    expect(m.get('a')!.sessionsSeen).toBe(1);
  });

  it('a planned person not in `active` is still stepped as a no-show', () => {
    const m = run([planned(['x'], {})], []);
    const x = m.get('x')!;
    expect(x.sessionsSeen).toBe(1);
    expect(x.sessionsPlanned).toBe(1);
    expect(x.reliability).toBeCloseTo(64, 5);
    expect(x.presence).toBeCloseTo(24, 5);
  });

  it('does not mutate the input map or score objects', () => {
    const a = newScore('a');
    const start = new Map([['a', a]]);
    const snapshot = { ...a };
    const out = applySession(start, planned(['a'], { a: 2 }), new Set(['a']));
    expect(out).not.toBe(start);
    expect(start.get('a')).toBe(a);
    expect(a).toEqual(snapshot);
    expect(start.size).toBe(1);
    expect(out.get('a')).not.toBe(a);
  });

  it('no label before 5 sessions: labels === ["new"]', () => {
    const m = run([direct({ a: 4 }), direct({ a: 4 }), direct({ a: 4 }), direct({ a: 4 })], ['a']);
    const a = m.get('a')!;
    expect(a.sessionsSeen).toBe(4);
    expect(attendanceLabels(a, { latestRootId: a.lastSessionRoot, topGuestId: 'a' })).toEqual(['new']);
    const m5 = run([direct({ a: 4 })], ['a'], new Map(m));
    expect(attendanceLabels(m5.get('a')!, { latestRootId: null, topGuestId: 'a' })).toContain('topGuest');
  });

  it('back: joined while presence ≤ 20 before the session, and lastSessionRoot is latest', () => {
    const skips = [direct({}), direct({}), direct({}), direct({}), direct({})];
    let m = run(skips, ['a']);
    expect(m.get('a')!.presence).toBeLessThanOrEqual(ATTENDANCE.rareAt);
    expect(attendanceLabels(m.get('a')!, noCtx)).toContain('rare');
    const back = direct({ a: 1 });
    m = run([back], ['a'], new Map(m));
    const a = m.get('a')!;
    expect(a.lastBack).toBe(true);
    expect(a.lastReturnGap).toBe(5);
    expect(a.lastSessionRoot).toBe(back.rootId);
    expect(attendanceLabels(a, { latestRootId: back.rootId, topGuestId: null })).toContain('back');
    expect(attendanceLabels(a, { latestRootId: 'other', topGuestId: null })).not.toContain('back');
    // Too few sessions before: not "back" even with low presence.
    const fresh = run([direct({}), direct({}), direct({}), direct({}), direct({ a: 1 })], ['a']);
    expect(fresh.get('a')!.lastBack).toBe(false);
  });

  it('wantedStamp: no-show streak ≥ 2 ended by playing in the latest session', () => {
    const last = planned(['a'], { a: 1 });
    const m = run([planned(['a'], {}), planned(['a'], {}), last], ['a']);
    const a = m.get('a')!;
    expect(a.lastEndedNoShowStreak).toBe(2);
    expect(wantedStamp(a, last.rootId)).toBe(true);
    expect(wantedStamp(a, 'other')).toBe(false);
    expect(wantedStamp(a, null)).toBe(false);
    const one = run([planned(['a'], {}), planned(['a'], { a: 1 })], ['a']).get('a')!;
    expect(wantedStamp(one, one.lastSessionRoot)).toBe(false);
  });

  it('turnout with no scores counts each slot at 0.8 and rounds', () => {
    expect(
      turnoutEstimate(
        [
          { participantId: 'a', slots: 1 },
          { participantId: 'b', slots: 3 },
        ],
        new Map(),
      ),
    ).toEqual({ likely: 3, total: 4, sure: 4, unsure: 0, flaky: 0 });
  });

  it('turnout buckets by reliability: ≥75 sure, 50–75 unsure, ≤50 flaky, weighted by slots', () => {
    const s = (id: string, reliability: number): [string, AttendanceScore] => [
      id,
      { ...newScore(id), reliability, sessionsSeen: 10, sessionsPlanned: 10 },
    ];
    const scores = new Map([s('a', 90), s('b', 75), s('c', 60), s('d', 50), s('e', 30)]);
    expect(
      turnoutEstimate(
        [
          { participantId: 'a', slots: 2 },
          { participantId: 'b', slots: 1 },
          { participantId: 'c', slots: 3 },
          { participantId: 'd', slots: 1 },
          { participantId: 'e', slots: 2 },
        ],
        scores,
      ),
    ).toEqual({ likely: Math.round(1.8 + 0.75 + 1.8 + 0.5 + 0.6), total: 9, sure: 3, unsure: 3, flaky: 3 });
  });

  it('mergeScores takes the max of every number; last* fields from the later lastPlayedOn', () => {
    const into: AttendanceScore = {
      ...newScore('a'),
      presence: 70,
      reliability: 40,
      guest: 3,
      presenceJoinStreak: 4,
      reliabilitySkipStreak: 2,
      sessionsSeen: 9,
      sessionsPlanned: 2,
      timesPlayed: 7,
      guestsTotal: 1,
      lastPlayedOn: '2026-02-01',
      lastSessionRoot: 'ra',
      lastBack: true,
      lastReturnGap: 6,
      lastEndedNoShowStreak: 0,
    };
    const from: AttendanceScore = {
      ...newScore('g'),
      presence: 50,
      reliability: 90,
      guest: 1,
      presenceSkipStreak: 3,
      reliabilityJoinStreak: 5,
      sessionsSeen: 4,
      sessionsPlanned: 6,
      timesPlayed: 3,
      guestsTotal: 5,
      lastPlayedOn: '2026-03-01',
      lastSessionRoot: 'rg',
      lastBack: false,
      lastReturnGap: 0,
      lastEndedNoShowStreak: 2,
    };
    expect(mergeScores(into, from)).toEqual({
      participantId: 'a',
      presence: 70,
      reliability: 90,
      guest: 3,
      presenceJoinStreak: 4,
      presenceSkipStreak: 3,
      reliabilityJoinStreak: 5,
      reliabilitySkipStreak: 2,
      sessionsSeen: 9,
      sessionsPlanned: 6,
      timesPlayed: 7,
      guestsTotal: 5,
      lastPlayedOn: '2026-03-01',
      lastSessionRoot: 'rg',
      lastBack: false,
      lastReturnGap: 0,
      lastEndedNoShowStreak: 2,
    });
    const keep = mergeScores(into, { ...from, lastPlayedOn: null });
    expect(keep.lastSessionRoot).toBe('ra');
    expect(keep.lastBack).toBe(true);
  });

  it('topGuestId: highest guest ≥ 1, ties → higher guestsTotal, then id', () => {
    const g = (id: string, guest: number, guestsTotal: number) => ({ ...newScore(id), guest, guestsTotal });
    expect(topGuestId([g('a', 0.9, 9)])).toBeNull();
    expect(topGuestId([g('a', 2, 1), g('b', 3, 1)])).toBe('b');
    expect(topGuestId([g('a', 2, 1), g('b', 2, 4)])).toBe('b');
    expect(topGuestId([g('c', 2, 4), g('b', 2, 4)])).toBe('b');
  });
});
