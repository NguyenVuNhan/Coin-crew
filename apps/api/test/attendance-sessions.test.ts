import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { getDb } from '@cc/api-db/client';
import { loadSportSessions, loadPeople } from '../src/attendance/sessions';
import { seedTrip, T, PID } from './helpers';

async function sql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

type Entry = [participantId: string, male: number, female: number];

function meta(entries: Entry[], planning?: boolean): string {
  return JSON.stringify({
    sport: {
      court: 100000, shuttlecocks: [], extra: 0, rule: { kind: 'equal' }, maleSlotRate: 0, femaleSlotRate: 0,
      entries: entries.map(([participantId, maleSlots, femaleSlots]) => ({ participantId, maleSlots, femaleSlots })),
      ...(planning === undefined ? {} : { planning }),
    },
  });
}

interface Version { meta: string | null; status?: string }

/** Inserts a version chain for `root`; the last version is the head (status defaults to 'approved'). */
async function chain(root: string, spentOn: string, createdAt: string, versions: Version[]): Promise<void> {
  const base = Date.parse(createdAt);
  for (const [i, v] of versions.entries()) {
    const id = i === 0 ? root : `${root}-v${i}`;
    const parent = i === 0 ? null : i === 1 ? root : `${root}-v${i - 1}`;
    const last = i === versions.length - 1;
    const at = new Date(base + i * 60_000).toISOString();
    await sql(
      "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, meta_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'expense', 'Cầu lông', 100000, 'VND', ?, ?, 'sport', ?, ?, ?, ?, ?)",
      id, root, parent, last ? 1 : 0, T.tripId, spentOn, PID.M, last ? (v.status ?? 'approved') : 'superseded', PID.M, v.meta, at, at,
    );
  }
}

const load = (exclude: Set<string> = new Set()) => loadSportSessions(getDb(env), T.tripId, exclude);

beforeEach(async () => {
  await seedTrip();
  await sql("UPDATE trips SET preset = 'sport' WHERE id = ?", T.tripId);
});

describe('loadSportSessions', () => {
  it('a plan finished into a bill: planned = true, planIds from the last planning version', async () => {
    await chain('r1', '2026-11-01', '2026-11-01T08:00:00.000Z', [
      { meta: meta([[PID.M, 1, 0], [PID.A, 1, 0], [PID.B, 0, 1]], true) },
      { meta: meta([[PID.M, 1, 0], [PID.A, 2, 0]]) },
    ]);
    const [s] = await load();
    expect(s).toEqual({
      rootId: 'r1', spentOn: '2026-11-01', planned: true,
      planIds: [PID.M, PID.A, PID.B],
      bill: [{ participantId: PID.M, slots: 1 }, { participantId: PID.A, slots: 2 }],
    });
  });

  it('a plan edited twice before finishing uses the last planning version', async () => {
    await chain('r1', '2026-11-01', '2026-11-01T08:00:00.000Z', [
      { meta: meta([[PID.M, 1, 0]], true) },
      { meta: meta([[PID.M, 1, 0], [PID.A, 1, 0]], true) },
      { meta: meta([[PID.A, 1, 0], [PID.C, 0, 1]], true) },
      { meta: meta([[PID.A, 1, 0]]) },
    ]);
    const [s] = await load();
    expect(s!.planned).toBe(true);
    expect(s!.planIds).toEqual([PID.A, PID.C]);
  });

  it('a bill edited after finishing still reads the plan from history (current planning flag gone)', async () => {
    await chain('r1', '2026-11-01', '2026-11-01T08:00:00.000Z', [
      { meta: meta([[PID.M, 1, 0], [PID.B, 1, 0]], true) },
      { meta: meta([[PID.M, 1, 0]], false) },
      { meta: meta([[PID.M, 1, 0], [PID.C, 1, 0]]) },
    ]);
    const [s] = await load();
    expect(s!.planned).toBe(true);
    expect(s!.planIds).toEqual([PID.M, PID.B]);
    expect(s!.bill).toEqual([{ participantId: PID.M, slots: 1 }, { participantId: PID.C, slots: 1 }]);
  });

  it('rollback to plan, re-plan, re-finish uses the latest plan', async () => {
    // P1 → B1 → rollback to P1 (P1') → edit to P2 → finish B2.
    await chain('r1', '2026-11-01', '2026-11-01T08:00:00.000Z', [
      { meta: meta([[PID.M, 1, 0], [PID.A, 1, 0]], true) },
      { meta: meta([[PID.M, 1, 0]]) },
      { meta: meta([[PID.M, 1, 0], [PID.A, 1, 0]], true) },
      { meta: meta([[PID.B, 1, 0], [PID.C, 0, 1]], true) },
      { meta: meta([[PID.B, 1, 0]]) },
    ]);
    const [s] = await load();
    expect(s!.planned).toBe(true);
    expect(s!.planIds).toEqual([PID.B, PID.C]);
    expect(s!.bill).toEqual([{ participantId: PID.B, slots: 1 }]);
  });

  it('disable then enable of a finished bill still loads it once', async () => {
    await chain('r1', '2026-11-01', '2026-11-01T08:00:00.000Z', [
      { meta: meta([[PID.M, 1, 0]], true) },
      { meta: meta([[PID.M, 1, 0], [PID.A, 1, 0]]) },
    ]);
    // Disable / enable flip the head's status in place (expenses/routes.ts), no new version.
    await sql("UPDATE transactions SET status = 'disabled' WHERE id = 'r1-v1'");
    expect(await load()).toEqual([]);
    await sql("UPDATE transactions SET status = 'approved' WHERE id = 'r1-v1'");
    const got = await load();
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ rootId: 'r1', planned: true, planIds: [PID.M] });
  });

  it('a direct bill: planned = false, planIds = []', async () => {
    await chain('r1', '2026-11-01', '2026-11-01T08:00:00.000Z', [{ meta: meta([[PID.M, 1, 0]]) }]);
    const [s] = await load();
    expect(s!.planned).toBe(false);
    expect(s!.planIds).toEqual([]);
  });

  it('slots = maleSlots + femaleSlots per entry', async () => {
    await chain('r1', '2026-11-01', '2026-11-01T08:00:00.000Z', [
      { meta: meta([[PID.M, 2, 1], [PID.A, 0, 3], [PID.B, 0, 0]]) },
    ]);
    const [s] = await load();
    expect(s!.bill).toEqual([{ participantId: PID.M, slots: 3 }, { participantId: PID.A, slots: 3 }]);
  });

  it('skips pending, disabled, still-planning and excluded roots', async () => {
    const day = '2026-11-01';
    const at = '2026-11-01T08:00:00.000Z';
    await chain('ok', day, at, [{ meta: meta([[PID.M, 1, 0]]) }]);
    await chain('pending', day, at, [{ meta: meta([[PID.M, 1, 0]]), status: 'pending' }]);
    await chain('disabled', day, at, [{ meta: meta([[PID.M, 1, 0]]), status: 'disabled' }]);
    await chain('rejected', day, at, [{ meta: meta([[PID.M, 1, 0]]), status: 'rejected' }]);
    await chain('planning', day, at, [{ meta: meta([[PID.M, 1, 0]], true) }]);
    await chain('excluded', day, at, [{ meta: meta([[PID.M, 1, 0]]) }]);
    await chain('plain', day, at, [{ meta: null }]);
    const got = await load(new Set(['excluded']));
    expect(got.map((s) => s.rootId)).toEqual(['ok']);
  });

  it('orders by spentOn then created_at', async () => {
    await chain('late', '2026-11-03', '2026-11-01T08:00:00.000Z', [{ meta: meta([[PID.M, 1, 0]]) }]);
    await chain('second', '2026-11-02', '2026-11-02T09:00:00.000Z', [{ meta: meta([[PID.M, 1, 0]]) }]);
    await chain('first', '2026-11-02', '2026-11-02T08:00:00.000Z', [
      { meta: meta([[PID.M, 1, 0]], true) },
      { meta: meta([[PID.M, 1, 0]]) },
      { meta: meta([[PID.M, 1, 0]]) },
    ]);
    await chain('early', '2026-11-01', '2026-11-05T08:00:00.000Z', [{ meta: meta([[PID.M, 1, 0]]) }]);
    expect((await load()).map((s) => s.rootId)).toEqual(['early', 'first', 'second', 'late']);
  });
});

describe('loadPeople', () => {
  it('resolves merged ids to the survivor', async () => {
    // Chi merged into Bình, who merged into An (a chain); Minh left.
    await sql("UPDATE participants SET status = 'merged', merged_into = ? WHERE id = ?", PID.B, PID.C);
    await sql("UPDATE participants SET status = 'merged', merged_into = ? WHERE id = ?", PID.A, PID.B);
    await sql("UPDATE participants SET status = 'left' WHERE id = ?", PID.M);
    const { resolve, active } = await loadPeople(getDb(env), T.tripId);
    expect(resolve(PID.C)).toBe(PID.A);
    expect(resolve(PID.B)).toBe(PID.A);
    expect(resolve(PID.A)).toBe(PID.A);
    expect(resolve(PID.M)).toBe(PID.M);
    expect(resolve('p-unknown')).toBe('p-unknown');
    expect([...active]).toEqual([PID.A]);
  });
});
