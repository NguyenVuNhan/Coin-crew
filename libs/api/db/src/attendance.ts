import type { AttendanceScore } from '@cc/core';
import type { BatchItem } from 'drizzle-orm/batch';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from './client';
import { attendanceCounted, attendanceScores, attendanceState } from './schema';
import { nowIso } from '@cc/api-util/ids';
import { isDbError } from '@cc/api-util/errors';

type ScoreRow = typeof attendanceScores.$inferSelect;

/** The insert values for one score row; `lastBack` is stored as 0/1. */
export function scoreToRow(tripId: string, score: AttendanceScore, now: string): ScoreRow {
  return {
    tripId,
    participantId: score.participantId,
    presence: score.presence,
    reliability: score.reliability,
    guest: score.guest,
    presenceJoinStreak: score.presenceJoinStreak,
    presenceSkipStreak: score.presenceSkipStreak,
    reliabilityJoinStreak: score.reliabilityJoinStreak,
    reliabilitySkipStreak: score.reliabilitySkipStreak,
    sessionsSeen: score.sessionsSeen,
    sessionsPlanned: score.sessionsPlanned,
    timesPlayed: score.timesPlayed,
    guestsTotal: score.guestsTotal,
    lastPlayedOn: score.lastPlayedOn,
    lastSessionRoot: score.lastSessionRoot,
    lastBack: score.lastBack ? 1 : 0,
    lastReturnGap: score.lastReturnGap,
    lastEndedNoShowStreak: score.lastEndedNoShowStreak,
    updatedAt: now,
  };
}

export function rowToScore(row: ScoreRow): AttendanceScore {
  return {
    participantId: row.participantId,
    presence: row.presence,
    reliability: row.reliability,
    guest: row.guest,
    presenceJoinStreak: row.presenceJoinStreak,
    presenceSkipStreak: row.presenceSkipStreak,
    reliabilityJoinStreak: row.reliabilityJoinStreak,
    reliabilitySkipStreak: row.reliabilitySkipStreak,
    sessionsSeen: row.sessionsSeen,
    sessionsPlanned: row.sessionsPlanned,
    timesPlayed: row.timesPlayed,
    guestsTotal: row.guestsTotal,
    lastPlayedOn: row.lastPlayedOn,
    lastSessionRoot: row.lastSessionRoot,
    lastBack: row.lastBack !== 0,
    lastReturnGap: row.lastReturnGap,
    lastEndedNoShowStreak: row.lastEndedNoShowStreak,
  };
}

export async function readAttendance(
  db: Db,
  tripId: string,
): Promise<{ version: number; scores: Map<string, AttendanceScore>; counted: Set<string> }> {
  const [state, rows, counted] = await db.batch([
    db.select({ version: attendanceState.version }).from(attendanceState).where(eq(attendanceState.tripId, tripId)),
    db.select().from(attendanceScores).where(eq(attendanceScores.tripId, tripId)),
    db.select({ rootId: attendanceCounted.rootId }).from(attendanceCounted).where(eq(attendanceCounted.tripId, tripId)),
  ]);
  return {
    version: state[0]?.version ?? 0,
    scores: new Map(rows.map((r) => [r.participantId, rowToScore(r)])),
    counted: new Set(counted.map((r) => r.rootId)),
  };
}

/**
 * One batch: version guard, upsert every score, insert every counted root. On a version miss nothing
 * lands. Same `changes()` trick as `guardedTripWrite` (commit.ts), but on `attendance_state`: the
 * second UPDATE sets `version` to NULL when the guarded bump missed, the NOT NULL constraint fails,
 * and D1 rolls the batch back. Does not touch `trips.version` or activity: counting is invisible
 * bookkeeping. A counted root that already exists fails the batch (it means a bug upstream).
 */
export async function commitAttendance(
  db: Db,
  tripId: string,
  expectedVersion: number,
  scores: AttendanceScore[],
  countedRoots: string[],
): Promise<'written' | 'raced'> {
  await db.insert(attendanceState).values({ tripId, version: 0 }).onConflictDoNothing();

  const now = nowIso();
  const guard = db
    .update(attendanceState)
    .set({ version: sql`${attendanceState.version} + 1` })
    .where(and(eq(attendanceState.tripId, tripId), eq(attendanceState.version, expectedVersion)));
  const failIfMissed = db
    .update(attendanceState)
    .set({ version: sql`CASE WHEN changes() > 0 THEN ${attendanceState.version} ELSE NULL END` })
    .where(eq(attendanceState.tripId, tripId));

  const upserts = scores.map((s) => {
    const row = scoreToRow(tripId, s, now);
    return db
      .insert(attendanceScores)
      .values(row)
      .onConflictDoUpdate({ target: [attendanceScores.tripId, attendanceScores.participantId], set: row });
  });
  const inserts = countedRoots.map((rootId) =>
    db.insert(attendanceCounted).values({ rootId, tripId, countedAt: now }),
  );

  try {
    await db.batch([guard, failIfMissed, ...upserts, ...inserts] as unknown as [
      BatchItem<'sqlite'>,
      ...BatchItem<'sqlite'>[],
    ]);
    return 'written';
  } catch (err) {
    if (isDbError(err, 'NOT NULL constraint failed: attendance_state.version')) return 'raced';
    throw err;
  }
}
