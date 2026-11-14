import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { newScore, type AttendanceScore } from '@cc/core';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@cc/api-db/schema';
import { getDb } from '@cc/api-db/client';
import { commitAttendance, readAttendance, rowToScore, scoreToRow } from '@cc/api-db/attendance';

const TRIP = 'trip-att';

function score(id: string, patch: Partial<AttendanceScore> = {}): AttendanceScore {
  return { ...newScore(id), ...patch };
}

describe('attendance db', () => {
  it('readAttendance of an empty group gives version 0, no scores', async () => {
    const got = await readAttendance(getDb(env), TRIP);
    expect(got.version).toBe(0);
    expect(got.scores.size).toBe(0);
    expect(got.counted.size).toBe(0);
  });

  it('commitAttendance writes scores and counted roots and bumps version', async () => {
    const db = getDb(env);
    const a = score('p-a', { presence: 42.5, timesPlayed: 3, lastPlayedOn: '2026-11-01', lastSessionRoot: 'r1', lastBack: true });
    const b = score('p-b');
    expect(await commitAttendance(db, TRIP, 0, [a, b], ['r1', 'r2'])).toBe('written');

    const first = await readAttendance(db, TRIP);
    expect(first.version).toBe(1);
    expect(first.scores.get('p-a')).toEqual(a);
    expect(first.scores.get('p-b')).toEqual(b);
    expect([...first.counted].sort()).toEqual(['r1', 'r2']);

    // Second write upserts an existing row.
    const a2 = { ...a, presence: 50, lastBack: false };
    expect(await commitAttendance(db, TRIP, 1, [a2], ['r3'])).toBe('written');
    const second = await readAttendance(db, TRIP);
    expect(second.version).toBe(2);
    expect(second.scores.get('p-a')).toEqual(a2);
    expect(second.scores.size).toBe(2);
    expect(second.counted.size).toBe(3);

    // trips.version and activity are untouched.
    const acts = await env.DB.prepare('SELECT COUNT(*) AS n FROM activity WHERE trip_id = ?').bind(TRIP).first<{ n: number }>();
    expect(acts!.n).toBe(0);
  });

  it('a stale version writes nothing and returns raced', async () => {
    const db = getDb(env);
    expect(await commitAttendance(db, TRIP, 0, [score('p-a')], ['r1'])).toBe('written');
    expect(await commitAttendance(db, TRIP, 0, [score('p-a', { presence: 99 }), score('p-c')], ['r2'])).toBe('raced');

    const got = await readAttendance(db, TRIP);
    expect(got.version).toBe(1);
    expect(got.scores.get('p-a')!.presence).toBe(newScore('p-a').presence);
    expect(got.scores.has('p-c')).toBe(false);
    expect([...got.counted]).toEqual(['r1']);
  });

  it('scoreToRow and rowToScore round-trip', () => {
    const s = score('p-x', { lastBack: true, guest: 1.6 });
    const row = scoreToRow(TRIP, s, '2026-11-13T00:00:00.000Z');
    expect(row.lastBack).toBe(1);
    expect(row.tripId).toBe(TRIP);
    expect(rowToScore(row)).toEqual(s);
  });
});

/** A drizzle client over env.DB that counts every prepared statement (same as people-summary.test.ts). */
function countingDb() {
  const counter = { queries: 0 };
  const proxied = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (q: string) => {
          counter.queries += 1;
          return target.prepare(q);
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
  return { db: drizzle(proxied, { schema }), counter };
}

describe('commitAttendance statement count', () => {
  it('writes 60 scores and 50 roots in a constant number of statements', async () => {
    const scores = Array.from({ length: 60 }, (_, i) =>
      score(`p-${i}`, { presence: 100 / 3 + i, reliability: 80 * 0.7 ** i, guest: 1.6 * i, lastBack: i % 2 === 0, lastSessionRoot: i % 3 ? `r${i}` : null }),
    );
    const roots = Array.from({ length: 50 }, (_, i) => `root-${i}`);

    const { db, counter } = countingDb();
    expect(await commitAttendance(db, TRIP, 0, scores, roots)).toBe('written');
    // Seed of attendance_state, guard, its check, one scores upsert, one counted insert.
    expect(counter.queries).toBeLessThanOrEqual(5);

    const got = await readAttendance(getDb(env), TRIP);
    expect(got.version).toBe(1);
    expect(got.scores.size).toBe(60);
    for (const s of scores) expect(got.scores.get(s.participantId)).toEqual(s);
    expect(got.counted).toEqual(new Set(roots));
  });

  it('the one-statement upsert updates every non-key column of an existing row', async () => {
    const db = getDb(env);
    expect(await commitAttendance(db, TRIP, 0, [score('p-a'), score('p-b')], [])).toBe('written');
    const a2 = score('p-a', {
      presence: 12.345, reliability: 67.89, guest: 2.4, presenceJoinStreak: 1, presenceSkipStreak: 2, reliabilityJoinStreak: 3,
      reliabilitySkipStreak: 4, sessionsSeen: 5, sessionsPlanned: 6, timesPlayed: 7, guestsTotal: 8, lastPlayedOn: '2026-11-02',
      lastSessionRoot: 'r9', lastBack: true, lastReturnGap: 9, lastEndedNoShowStreak: 10,
    });
    expect(await commitAttendance(db, TRIP, 1, [a2], ['r9'])).toBe('written');
    const got = await readAttendance(db, TRIP);
    expect(got.scores.get('p-a')).toEqual(a2);
    expect(got.scores.get('p-b')).toEqual(score('p-b'));
  });

  it('a stale version with many scores still writes nothing', async () => {
    const db = getDb(env);
    expect(await commitAttendance(db, TRIP, 0, [score('p-a')], ['r1'])).toBe('written');
    const many = Array.from({ length: 30 }, (_, i) => score(`p-${i}`, { presence: 99 }));
    expect(await commitAttendance(db, TRIP, 0, many, ['r2', 'r3'])).toBe('raced');
    const got = await readAttendance(db, TRIP);
    expect(got.scores.size).toBe(1);
    expect([...got.counted]).toEqual(['r1']);
  });
});
