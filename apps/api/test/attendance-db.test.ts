import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { newScore, type AttendanceScore } from '@cc/core';
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
