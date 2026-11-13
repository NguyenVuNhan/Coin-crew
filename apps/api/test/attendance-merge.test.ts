import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { newScore, type AttendanceScore } from '@cc/core';
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
});
