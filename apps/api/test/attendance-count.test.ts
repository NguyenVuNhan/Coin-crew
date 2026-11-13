import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySession, newScore, type AttendanceScore, type AttendanceSession, type AttendanceView, type ExpenseInput } from '@cc/core';
import { getDb } from '@cc/api-db/client';
import { commitAttendance, readAttendance } from '@cc/api-db/attendance';
import { countPendingSessions } from '../src/attendance/count';
import { call, json, seedTrip, seedUser, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const anMember = async () => ({ Cookie: `sid=${await memberSid(U.an, 'An')}` });

async function sql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

type Entry = [participantId: string, slots: number];

function meta(entries: Entry[], planning?: boolean): string {
  return JSON.stringify({
    sport: {
      court: 100000, shuttlecocks: [], extra: 0, rule: { kind: 'equal' }, maleSlotRate: 0, femaleSlotRate: 0,
      entries: entries.map(([participantId, slots]) => ({ participantId, maleSlots: slots, femaleSlots: 0 })),
      ...(planning === undefined ? {} : { planning }),
    },
  });
}

/** A finished session: an optional plan version, then the bill as the approved head. */
async function session(root: string, spentOn: string, bill: Entry[], plan?: string[]): Promise<void> {
  const versions = [...(plan ? [meta(plan.map((p) => [p, 1] as Entry), true)] : []), meta(bill)];
  const base = Date.parse(`${spentOn}T08:00:00.000Z`);
  for (const [i, m] of versions.entries()) {
    const id = i === 0 ? root : `${root}-v${i}`;
    const parent = i === 0 ? null : i === 1 ? root : `${root}-v${i - 1}`;
    const last = i === versions.length - 1;
    const at = new Date(base + i * 60_000).toISOString();
    await sql(
      "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, meta_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'expense', 'Cầu lông', 100000, 'VND', ?, ?, 'sport', ?, ?, ?, ?, ?)",
      id, root, parent, last ? 1 : 0, T.tripId, spentOn, PID.M, last ? 'approved' : 'superseded', PID.M, m, at, at,
    );
  }
}

const planningInput: ExpenseInput = {
  description: 'Cầu lông sáng CN',
  amount: 0,
  spentOn: '2026-11-30',
  payerId: PID.M,
  mode: 'amounts',
  entries: [
    { participantId: PID.M, value: 0 },
    { participantId: PID.A, value: 0 },
  ],
  meta: {
    sport: {
      planning: true,
      court: 168000,
      shuttlecocks: [],
      extra: 0,
      rule: { kind: 'equal' },
      entries: [
        { participantId: PID.M, maleSlots: 0, femaleSlots: 1 },
        { participantId: PID.A, maleSlots: 1, femaleSlots: 0 },
      ],
      maleSlotRate: 0,
      femaleSlotRate: 0,
    },
  },
};

async function createPlan(): Promise<Response> {
  return call(`${base}/expenses`, {
    method: 'POST',
    headers: { ...(await minh()), 'Content-Type': 'application/json' },
    body: JSON.stringify(planningInput),
  });
}

async function preview(): Promise<AttendanceView> {
  const res = await call(`${base}/attendance`, { headers: await minh() });
  expect(res.status).toBe(200);
  return json<AttendanceView>(res);
}

/** The expected fold: tracked (has a row) and active people are stepped; everyone on a plan or bill gets a row. */
function expectedFold(sessions: AttendanceSession[], active: Set<string>): Map<string, AttendanceScore> {
  let scores = new Map<string, AttendanceScore>();
  for (const s of sessions) {
    scores = applySession(scores, s, new Set([...scores.keys()].filter((id) => active.has(id))));
  }
  return scores;
}

const db = () => getDb(env);
const all = new Set<string>([PID.M, PID.A, PID.B, PID.C]);

beforeEach(async () => {
  await seedTrip();
  await seedUser(U.an, 'An');
  await sql("UPDATE trips SET preset = 'sport' WHERE id = ?", T.tripId);
  await sql("UPDATE participants SET user_id = ?, gender = 'M' WHERE id = ?", U.an, PID.A);
  await sql("UPDATE participants SET gender = 'F' WHERE id = ?", PID.M);
});

describe('counting sessions on a new plan', () => {
  it('creating a plan counts finished sessions oldest first and stores scores', async () => {
    // Inserted newest first: counting must still go oldest first.
    await session('r2', '2026-11-02', [[PID.M, 1], [PID.A, 2]]);
    await session('r1', '2026-11-01', [[PID.M, 1]], [PID.M, PID.A, PID.B]);

    expect((await createPlan()).status).toBe(201);

    const got = await readAttendance(db(), T.tripId);
    expect(got.version).toBe(1);
    expect([...got.counted].sort()).toEqual(['r1', 'r2']);
    const want = expectedFold(
      [
        { rootId: 'r1', spentOn: '2026-11-01', planned: true, planIds: [PID.M, PID.A, PID.B], bill: [{ participantId: PID.M, slots: 1 }] },
        { rootId: 'r2', spentOn: '2026-11-02', planned: false, planIds: [], bill: [{ participantId: PID.M, slots: 1 }, { participantId: PID.A, slots: 2 }] },
      ],
      all,
    );
    expect(got.scores).toEqual(want);
    // Chi never appeared on a plan or bill: no row.
    expect(got.scores.has(PID.C)).toBe(false);
    expect(got.scores.get(PID.B)?.lastSessionRoot).toBe('r2');
  });

  it('first plan after launch counts every historical session once', async () => {
    await session('h1', '2026-09-01', [[PID.M, 1], [PID.A, 1]], [PID.M, PID.A]);
    await session('h2', '2026-09-08', [[PID.M, 1], [PID.B, 1]]);
    await session('h3', '2026-09-15', [[PID.A, 1], [PID.B, 3]], [PID.A, PID.B, PID.C]);

    expect((await createPlan()).status).toBe(201);
    const first = await readAttendance(db(), T.tripId);
    expect(first.version).toBe(1);
    expect([...first.counted].sort()).toEqual(['h1', 'h2', 'h3']);
    // Minh and An were seen from h1 on; Bình from h2; Chi from h3.
    expect(first.scores.get(PID.M)?.sessionsSeen).toBe(3);
    expect(first.scores.get(PID.A)?.sessionsSeen).toBe(3);
    expect(first.scores.get(PID.B)?.sessionsSeen).toBe(2);
    expect(first.scores.get(PID.C)?.sessionsSeen).toBe(1);

    // A second plan finds nothing new: no second count, no version bump.
    expect((await createPlan()).status).toBe(201);
    const second = await readAttendance(db(), T.tripId);
    expect(second.version).toBe(1);
    expect(second.scores).toEqual(first.scores);
  });

  it('an edit after counting is not recounted', async () => {
    await session('r1', '2026-11-01', [[PID.M, 1], [PID.A, 1]], [PID.M, PID.A]);
    expect((await createPlan()).status).toBe(201);
    const before = await readAttendance(db(), T.tripId);

    // The bill is edited afterwards (a new head with a different list).
    await sql("UPDATE transactions SET is_latest = 0, status = 'superseded' WHERE id = 'r1-v1'");
    await sql(
      "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, meta_json, created_at, updated_at) VALUES ('r1-v2', 'r1', 'r1-v1', 1, ?, 'expense', 'Cầu lông', 100000, 'VND', '2026-11-01', ?, 'sport', 'approved', ?, ?, '2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.000Z')",
      T.tripId, PID.M, PID.M, meta([[PID.M, 1], [PID.B, 1]]),
    );

    expect(await countPendingSessions(db(), T.tripId)).toBe('nothing');
    expect((await createPlan()).status).toBe(201);
    const after = await readAttendance(db(), T.tripId);
    expect(after.version).toBe(before.version);
    expect(after.scores).toEqual(before.scores);
  });

  it('a stale version writes nothing', async () => {
    await session('r1', '2026-11-01', [[PID.M, 1]]);
    const stale = await readAttendance(db(), T.tripId);
    expect(stale.version).toBe(0);

    // Another counter gets in between this read and its write.
    expect(await countPendingSessions(db(), T.tripId)).toBe('counted');
    const between = await readAttendance(db(), T.tripId);

    const late = { ...newScore(PID.C), timesPlayed: 9 };
    expect(await commitAttendance(db(), T.tripId, stale.version, [late], ['r-late'])).toBe('raced');

    const after = await readAttendance(db(), T.tripId);
    expect(after.version).toBe(between.version);
    expect(after.scores).toEqual(between.scores);
    expect(after.scores.has(PID.C)).toBe(false);
    expect(after.counted.has('r-late')).toBe(false);
  });

  it('counting failure does not fail plan creation', async () => {
    await session('r1', '2026-11-01', [[PID.M, 1]]);
    await sql("CREATE TRIGGER att_fail BEFORE INSERT ON attendance_scores BEGIN SELECT RAISE(ABORT, 'boom'); END");
    try {
      const res = await createPlan();
      expect(res.status).toBe(201);
      const { expenseId } = await json<{ expenseId: string }>(res);
      const row = await env.DB.prepare('SELECT id FROM transactions WHERE id = ?').bind(expenseId).first();
      expect(row).not.toBeNull();
    } finally {
      await sql('DROP TRIGGER att_fail');
    }
    const got = await readAttendance(db(), T.tripId);
    expect(got.counted.size).toBe(0);
    expect(got.scores.size).toBe(0);
  });
});

describe('GET attendance', () => {
  it('preview includes a finished session not yet counted, without writing it', async () => {
    await session('r1', '2026-11-01', [[PID.M, 1], [PID.A, 1]], [PID.M, PID.A]);
    expect((await createPlan()).status).toBe(201);
    await session('r2', '2026-11-08', [[PID.M, 1], [PID.B, 2]], [PID.M, PID.A, PID.B]);
    const before = await readAttendance(db(), T.tripId);

    const view = await preview();
    expect(view.pendingSessions).toBe(1);
    expect(view.latestSession).toEqual({ rootId: 'r2', spentOn: '2026-11-08' });
    const byId = new Map(view.people.map((p) => [p.participantId, p]));
    expect(byId.get(PID.M)?.score.sessionsSeen).toBe(2);
    expect(byId.get(PID.B)?.score.sessionsSeen).toBe(1);
    expect(byId.get(PID.B)?.score.guestsTotal).toBe(1);
    expect(byId.get(PID.A)?.score.reliabilitySkipStreak).toBe(1);
    expect(byId.get(PID.M)?.labels).toEqual(['new']);

    const after = await readAttendance(db(), T.tripId);
    expect(after).toEqual(before);
    expect(after.counted.has('r2')).toBe(false);
  });

  it('preview on a direct-bill-only group still returns scores', async () => {
    await session('d1', '2026-10-01', [[PID.M, 1], [PID.A, 1]]);
    await session('d2', '2026-10-08', [[PID.M, 1]]);

    const view = await preview();
    expect(view.pendingSessions).toBe(2);
    expect(view.latestSession).toEqual({ rootId: 'd2', spentOn: '2026-10-08' });
    const byId = new Map(view.people.map((p) => [p.participantId, p]));
    expect([...byId.keys()].sort()).toEqual([PID.M, PID.A].sort());
    expect(byId.get(PID.M)?.score.timesPlayed).toBe(2);
    expect(byId.get(PID.M)?.score.sessionsPlanned).toBe(0);
    expect(byId.get(PID.A)?.score.presenceSkipStreak).toBe(1);
    expect(byId.get(PID.A)!.score.presence).toBeLessThan(byId.get(PID.M)!.score.presence);
  });

  it('GET attendance is 403 for a member who is not an admin, a guest and a viewer; 403 in a trip group', async () => {
    const url = `${base}/attendance`;
    expect((await call(url, { headers: await anMember() })).status).toBe(403);
    expect((await call(url, { headers: await guestHeaders(PID.C) })).status).toBe(403);
    expect((await call(url, { headers: await guestHeaders(undefined, T.viewToken) })).status).toBe(403);
    expect((await call(url, { headers: await minh() })).status).toBe(200);

    await sql("UPDATE trips SET preset = 'trip' WHERE id = ?", T.tripId);
    expect((await call(url, { headers: await minh() })).status).toBe(403);
  });

  it('labels and wantedStamp use the latest session overall', async () => {
    // Bình is planned twice and does not come, then plays in r3: a wanted stamp for r3.
    await session('r1', '2026-11-01', [[PID.M, 1]], [PID.M, PID.B]);
    await session('r2', '2026-11-02', [[PID.M, 1]], [PID.M, PID.B]);
    await session('r3', '2026-11-03', [[PID.M, 1], [PID.B, 1]], [PID.M, PID.B]);
    expect((await createPlan()).status).toBe(201);

    let view = await preview();
    expect(view.latestSession).toEqual({ rootId: 'r3', spentOn: '2026-11-03' });
    expect(view.people.find((p) => p.participantId === PID.B)?.wantedStamp).toBe(true);

    // Bình leaves; r4 happens without Bình (not yet counted). Bình is not shown while left.
    await sql("UPDATE participants SET status = 'left' WHERE id = ?", PID.B);
    await session('r4', '2026-11-04', [[PID.M, 1]]);
    view = await preview();
    expect(view.latestSession).toEqual({ rootId: 'r4', spentOn: '2026-11-04' });
    expect(view.people.some((p) => p.participantId === PID.B)).toBe(false);

    // r4 is counted while Bình is away (paused), then Bình is back: their last session is r3, which
    // is no longer the latest (found from stored scores, nothing pending), so no stamp.
    expect((await createPlan()).status).toBe(201);
    await sql("UPDATE participants SET status = 'active' WHERE id = ?", PID.B);
    view = await preview();
    expect(view.pendingSessions).toBe(0);
    expect(view.latestSession).toEqual({ rootId: 'r4', spentOn: '2026-11-04' });
    const binh = view.people.find((p) => p.participantId === PID.B);
    expect(binh?.score.lastSessionRoot).toBe('r3');
    expect(binh?.wantedStamp).toBe(false);
  });
});
