import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { mergeScores, newScore, type AttendanceScore } from '@cc/core';
import { getDb } from '@cc/api-db/client';
import { commitAttendance, readAttendance } from '@cc/api-db/attendance';
import { call, seedTrip, memberSid, T, U, PID } from './helpers';

const merge = async (fromId: string, intoId: string) =>
  call(`/api/trips/${T.tripId}/people/merge`, {
    method: 'POST',
    headers: { Cookie: `sid=${await memberSid(U.minh, 'Minh')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromId, intoId }),
  });

function score(id: string, patch: Partial<AttendanceScore> = {}): AttendanceScore {
  return { ...newScore(id), ...patch };
}

async function seedScores(scores: AttendanceScore[]) {
  expect(await commitAttendance(getDb(env), T.tripId, 0, scores, [])).toBe('written');
}

async function scoreRows() {
  const { results } = await env.DB.prepare('SELECT participant_id FROM attendance_scores WHERE trip_id = ? ORDER BY participant_id')
    .bind(T.tripId)
    .all<{ participant_id: string }>();
  return results.map((r) => r.participant_id);
}

beforeEach(seedTrip);

describe('attendance scores on merge', () => {
  it('merging a guest into a member keeps the max of each score and deletes the guest\'s row', async () => {
    const guest = score(PID.B, {
      presence: 80,
      reliability: 30,
      timesPlayed: 9,
      sessionsSeen: 4,
      lastPlayedOn: '2026-11-10',
      lastSessionRoot: 'r-guest',
      lastBack: true,
      lastReturnGap: 3,
    });
    const member = score(PID.A, {
      presence: 40,
      reliability: 70,
      timesPlayed: 2,
      sessionsSeen: 12,
      lastPlayedOn: '2026-11-01',
      lastSessionRoot: 'r-member',
    });
    await seedScores([guest, member]);

    expect((await merge(PID.B, PID.A)).status).toBe(204);

    const { scores } = await readAttendance(getDb(env), T.tripId);
    expect(scores.has(PID.B)).toBe(false);
    expect(scores.get(PID.A)).toMatchObject({
      participantId: PID.A,
      presence: 80,
      reliability: 70,
      timesPlayed: 9,
      sessionsSeen: 12,
      lastPlayedOn: '2026-11-10',
      lastSessionRoot: 'r-guest',
      lastBack: true,
      lastReturnGap: 3,
    });
  });

  it('merging into someone without a row moves the row', async () => {
    const guest = score(PID.B, { presence: 65, timesPlayed: 5, lastPlayedOn: '2026-11-09', lastSessionRoot: 'r1' });
    await seedScores([guest]);

    expect((await merge(PID.B, PID.A)).status).toBe(204);

    const { scores } = await readAttendance(getDb(env), T.tripId);
    expect(await scoreRows()).toEqual([PID.A]);
    expect(scores.get(PID.A)).toEqual({ ...guest, participantId: PID.A });
  });

  it('merging someone without a row leaves the survivor\'s row as it was', async () => {
    const member = score(PID.A, { presence: 55, timesPlayed: 7 });
    await seedScores([member]);

    expect((await merge(PID.B, PID.A)).status).toBe(204);

    const { scores } = await readAttendance(getDb(env), T.tripId);
    expect(await scoreRows()).toEqual([PID.A]);
    expect(scores.get(PID.A)).toEqual(member);
  });

  it('merging two people without rows writes nothing', async () => {
    await seedScores([score(PID.C, { presence: 10 })]);

    expect((await merge(PID.B, PID.A)).status).toBe(204);

    expect(await scoreRows()).toEqual([PID.C]);
  });

  it('the SQL merge equals mergeScores for a mixed pair', async () => {
    const into = score(PID.A, {
      presence: 90, reliability: 20, guest: 5, presenceJoinStreak: 4, presenceSkipStreak: 0,
      reliabilityJoinStreak: 1, reliabilitySkipStreak: 3, sessionsSeen: 10, sessionsPlanned: 2,
      timesPlayed: 8, guestsTotal: 0, lastPlayedOn: '2026-11-02', lastSessionRoot: 'r-into',
      lastBack: false, lastReturnGap: 7, lastEndedNoShowStreak: 2,
    });
    const from = score(PID.B, {
      presence: 30, reliability: 60, guest: 1, presenceJoinStreak: 0, presenceSkipStreak: 5,
      reliabilityJoinStreak: 6, reliabilitySkipStreak: 0, sessionsSeen: 3, sessionsPlanned: 9,
      timesPlayed: 2, guestsTotal: 4, lastPlayedOn: '2026-11-12', lastSessionRoot: 'r-from',
      lastBack: true, lastReturnGap: 1, lastEndedNoShowStreak: 0,
    });
    await seedScores([into, from]);

    expect((await merge(PID.B, PID.A)).status).toBe(204);

    const { scores } = await readAttendance(getDb(env), T.tripId);
    expect(scores.get(PID.A)).toEqual(mergeScores(into, from));
    expect(scores.has(PID.B)).toBe(false);
  });

  it('on equal last_played_on the survivor keeps its own last_* fields, like mergeScores', async () => {
    const into = score(PID.A, { lastPlayedOn: '2026-11-05', lastSessionRoot: 'r-into', lastReturnGap: 2 });
    const from = score(PID.B, { lastPlayedOn: '2026-11-05', lastSessionRoot: 'r-from', lastReturnGap: 9, lastBack: true });
    await seedScores([into, from]);

    expect((await merge(PID.B, PID.A)).status).toBe(204);

    const { scores } = await readAttendance(getDb(env), T.tripId);
    expect(scores.get(PID.A)).toEqual(mergeScores(into, from));
    expect(scores.get(PID.A)!.lastSessionRoot).toBe('r-into');
  });

  it('every merge bumps the attendance version, even with no scores', async () => {
    expect((await merge(PID.B, PID.A)).status).toBe(204);
    expect((await readAttendance(getDb(env), T.tripId)).version).toBe(1);

    expect(await commitAttendance(getDb(env), T.tripId, 0, [score(PID.C)], [])).toBe('raced');
    expect(await commitAttendance(getDb(env), T.tripId, 1, [score(PID.C)], [])).toBe('written');
    expect((await merge(PID.C, PID.A)).status).toBe(204);
    expect((await readAttendance(getDb(env), T.tripId)).version).toBe(3);
  });

  it('a count that read before the merge races and leaves the merged row', async () => {
    const from = score(PID.B, { presence: 77, lastPlayedOn: '2026-11-10' });
    const into = score(PID.A, { reliability: 66 });
    await seedScores([from, into]);
    const before = await readAttendance(getDb(env), T.tripId);

    expect((await merge(PID.B, PID.A)).status).toBe(204);

    // The stale count tries to write the pre-merge rows back.
    expect(await commitAttendance(getDb(env), T.tripId, before.version, [from, into], ['r-late'])).toBe('raced');
    const after = await readAttendance(getDb(env), T.tripId);
    expect(await scoreRows()).toEqual([PID.A]);
    expect(after.scores.get(PID.A)).toEqual(mergeScores(into, from));
    expect(after.counted.has('r-late')).toBe(false);
  });

  it('the merge log holds the attendance_scores before-images', async () => {
    const from = score(PID.B, { presence: 12, timesPlayed: 3 });
    const into = score(PID.A, { presence: 50 });
    await seedScores([from, into]);

    expect((await merge(PID.B, PID.A)).status).toBe(204);

    const { results } = await env.DB.prepare("SELECT row_key, before_json FROM participant_merge_rows WHERE table_name = 'attendance_scores'")
      .all<{ row_key: string; before_json: string }>();
    const byPid = new Map(results.map((r) => [JSON.parse(r.row_key).participant_id as string, JSON.parse(r.before_json)]));
    expect([...byPid.keys()].sort()).toEqual([PID.A, PID.B].sort());
    expect(JSON.parse(results[0]!.row_key)).toHaveProperty('trip_id', T.tripId);
    expect(byPid.get(PID.B)).toMatchObject({ presence: 12, times_played: 3 });
    expect(byPid.get(PID.A)).toMatchObject({ presence: 50 });
  });
});
