import type { AttendanceScore } from '@cc/core';
import { eq, getTableColumns } from 'drizzle-orm';
import type { Db } from './client';
import { attendanceCounted, attendanceScores, attendanceState } from './schema';
import { nowIso } from '@cc/api-util/ids';
import { isDbError } from '@cc/api-util/errors';

type ScoreRow = typeof attendanceScores.$inferSelect;

/** `{ key, name }` for every attendance_scores column: key is the row property, name the SQL column. */
const SCORE_COLS = Object.entries(getTableColumns(attendanceScores)).map(([key, col]) => ({ key, name: col.name }));
/** Upserts every row of a JSON array of `scoreToRow` objects (bound as ?1). `WHERE true` lets SQLite parse ON CONFLICT after a SELECT. */
const SCORE_UPSERT = `INSERT INTO attendance_scores (${SCORE_COLS.map((c) => `"${c.name}"`).join(', ')})
  SELECT ${SCORE_COLS.map((c) => `json_extract(value, '$.${c.key}')`).join(', ')} FROM json_each(?1) WHERE true
  ON CONFLICT (trip_id, participant_id) DO UPDATE SET ${SCORE_COLS.filter((c) => c.name !== 'trip_id' && c.name !== 'participant_id')
    .map((c) => `"${c.name}" = excluded."${c.name}"`)
    .join(', ')}`;

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
 * One batch of at most four statements: version guard, its check, one upsert of every score (a JSON array
 * through json_each), one insert of every counted root. On a version miss nothing
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

  // Raw D1 statements: drizzle's db.run(sql) can't be put in db.batch, and the json_each upserts
  // have no query-builder form. One statement for every score and one for every counted root,
  // whatever the group's size: D1 counts each batch statement against the per-invocation query
  // limit (50 on the free plan).
  const d1 = db.$client;
  const now = nowIso();
  const items: D1PreparedStatement[] = [
    d1.prepare('UPDATE attendance_state SET version = version + 1 WHERE trip_id = ?1 AND version = ?2').bind(tripId, expectedVersion),
    d1
      .prepare('UPDATE attendance_state SET version = CASE WHEN changes() > 0 THEN version ELSE NULL END WHERE trip_id = ?1')
      .bind(tripId),
  ];
  if (scores.length > 0) {
    items.push(d1.prepare(SCORE_UPSERT).bind(JSON.stringify(scores.map((s) => scoreToRow(tripId, s, now)))));
  }
  if (countedRoots.length > 0) {
    items.push(
      d1
        .prepare('INSERT INTO attendance_counted (root_id, trip_id, counted_at) SELECT value, ?1, ?2 FROM json_each(?3)')
        .bind(tripId, now, JSON.stringify(countedRoots)),
    );
  }

  try {
    await d1.batch(items);
    return 'written';
  } catch (err) {
    if (isDbError(err, 'NOT NULL constraint failed: attendance_state.version')) return 'raced';
    throw err;
  }
}
