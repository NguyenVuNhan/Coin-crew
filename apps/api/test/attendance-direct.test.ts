import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import type { ExpenseInput } from '@cc/core';
import { getDb } from '@cc/api-db/client';
import { readAttendance } from '@cc/api-db/attendance';
import { call, json, memberSid, PID, seedTrip, seedUser, T, U } from './helpers';

const base = `/api/trips/${T.tripId}`;
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });

async function sql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

function directBillInput(spentOn: string, players: [string, string]): ExpenseInput {
  const [p1, p2] = players;
  return {
    description: `Cầu lông ${spentOn}`,
    amount: 100000,
    spentOn,
    payerId: PID.M,
    mode: 'amounts',
    entries: [
      { participantId: p1, value: 50000 },
      { participantId: p2, value: 50000 },
    ],
    meta: {
      sport: {
        court: 100000,
        shuttlecocks: [],
        extra: 0,
        rule: { kind: 'equal' },
        entries: [
          { participantId: p1, maleSlots: 1, femaleSlots: 0 },
          { participantId: p2, maleSlots: 1, femaleSlots: 0 },
        ],
        maleSlotRate: 50000,
        femaleSlotRate: 0,
      },
    },
  };
}

async function postDirectBill(spentOn: string, players: [string, string] = [PID.M, PID.A]): Promise<Response> {
  return call(`${base}/expenses`, {
    method: 'POST',
    headers: { ...(await minh()), 'Content-Type': 'application/json' },
    body: JSON.stringify(directBillInput(spentOn, players)),
  });
}

const db = () => getDb(env);

beforeEach(async () => {
  await seedTrip();
  await seedUser(U.an, 'An');
  await sql("UPDATE trips SET preset = 'sport' WHERE id = ?", T.tripId);
  await sql("UPDATE participants SET user_id = ?, gender = 'M' WHERE id = ?", U.an, PID.A);
  await sql("UPDATE participants SET gender = 'M' WHERE id = ?", PID.M);
  await sql("UPDATE participants SET gender = 'M' WHERE id = ?", PID.B);
});

describe('direct sport bills count prior finished sessions (Ruling 15)', () => {
  it('three direct sport bills in a row: after the third, the first two are counted and the third is not', async () => {
    const res1 = await postDirectBill('2026-11-01', [PID.M, PID.A]);
    expect(res1.status).toBe(201);
    const { expenseId: id1 } = await json<{ expenseId: string }>(res1);

    // After the first direct bill, nothing prior existed, and the first bill itself was excluded.
    const after1 = await readAttendance(db(), T.tripId);
    expect([...after1.counted]).toEqual([]);
    expect(after1.scores.size).toBe(0);

    const res2 = await postDirectBill('2026-11-08', [PID.M, PID.B]);
    expect(res2.status).toBe(201);
    const { expenseId: id2 } = await json<{ expenseId: string }>(res2);

    // After the second direct bill, the first is counted and the second is excluded.
    const after2 = await readAttendance(db(), T.tripId);
    expect([...after2.counted]).toEqual([id1]);

    const res3 = await postDirectBill('2026-11-15', [PID.A, PID.B]);
    expect(res3.status).toBe(201);
    const { expenseId: id3 } = await json<{ expenseId: string }>(res3);

    // After the third direct bill, the first two are counted and the third is not.
    const after3 = await readAttendance(db(), T.tripId);
    expect([...after3.counted].sort()).toEqual([id1, id2].sort());
    expect(after3.counted.has(id3)).toBe(false);
    expect(after3.scores.get(PID.M)?.sessionsSeen).toBe(2);
    expect(after3.scores.get(PID.M)?.timesPlayed).toBe(2);
    expect(after3.scores.get(PID.A)?.sessionsSeen).toBe(2);
    expect(after3.scores.get(PID.A)?.timesPlayed).toBe(1);
    expect(after3.scores.get(PID.B)?.sessionsSeen).toBe(1);
    expect(after3.scores.get(PID.B)?.timesPlayed).toBe(1);
  });

  it('returns 201 even if attendance counting throws during a direct sport bill', async () => {
    const res1 = await postDirectBill('2026-11-01', [PID.M, PID.A]);
    expect(res1.status).toBe(201);

    await sql("CREATE TRIGGER att_direct_fail BEFORE INSERT ON attendance_scores BEGIN SELECT RAISE(ABORT, 'boom'); END");
    try {
      const res2 = await postDirectBill('2026-11-08', [PID.M, PID.B]);
      expect(res2.status).toBe(201);
      const { expenseId } = await json<{ expenseId: string }>(res2);
      const row = await env.DB.prepare('SELECT id FROM transactions WHERE id = ?').bind(expenseId).first();
      expect(row).not.toBeNull();
    } finally {
      await sql('DROP TRIGGER att_direct_fail');
    }

    const got = await readAttendance(db(), T.tripId);
    expect(got.counted.size).toBe(0);
    expect(got.scores.size).toBe(0);
  });
});
