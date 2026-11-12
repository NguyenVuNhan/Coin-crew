import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { call, seedTrip, memberSid, T, U, PID } from './helpers';

const merge = async (fromId: string, intoId: string) =>
  call(`/api/trips/${T.tripId}/people/merge`, {
    method: 'POST',
    headers: { Cookie: `sid=${await memberSid(U.minh, 'Minh')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromId, intoId }),
  });

type Ref = { code: string; from_id: string; to_id: string };
type MergeRow = { table_name: string; before_json: string };

async function note(code: string, fromId: string, toId: string, createdAt = '2026-10-10T00:00:00.000Z') {
  await env.DB.prepare('INSERT INTO payment_refs (code, trip_id, from_id, to_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(code, T.tripId, fromId, toId, createdAt).run();
}

async function refs(): Promise<Ref[]> {
  const { results } = await env.DB.prepare('SELECT code, from_id, to_id FROM payment_refs WHERE trip_id = ? ORDER BY code')
    .bind(T.tripId).all<Ref>();
  return results;
}

/** Writes every logged row back as it was before the merge (the undo the merge log exists for). */
async function replay() {
  const { results } = await env.DB.prepare('SELECT table_name, before_json FROM participant_merge_rows').all<MergeRow>();
  for (const r of results) {
    const before = JSON.parse(r.before_json) as Record<string, unknown>;
    const cols = Object.keys(before);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO ${r.table_name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    ).bind(...cols.map((c) => before[c])).run();
  }
}

beforeEach(seedTrip);

describe('merging people who both have transfer notes', () => {
  it('keeps one note per pair, the survivor\'s, when both had a note with the same person', async () => {
    await note('A-TO-M', PID.A, PID.M);
    await note('B-TO-M', PID.B, PID.M, '2026-10-11T00:00:00.000Z');
    await note('C-TO-A', PID.C, PID.A);
    await note('C-TO-B', PID.C, PID.B, '2026-10-11T00:00:00.000Z');
    await note('A-TO-C', PID.A, PID.C);

    expect((await merge(PID.A, PID.B)).status).toBe(204);

    expect(await refs()).toEqual([
      { code: 'A-TO-C', from_id: PID.B, to_id: PID.C },
      { code: 'B-TO-M', from_id: PID.B, to_id: PID.M },
      { code: 'C-TO-B', from_id: PID.C, to_id: PID.B },
    ]);
  });

  it('drops notes between the two people instead of leaving a self-pair', async () => {
    await note('A-TO-B', PID.A, PID.B);
    await note('B-TO-A', PID.B, PID.A);
    await note('B-TO-M', PID.B, PID.M);

    expect((await merge(PID.A, PID.B)).status).toBe(204);

    const after = await refs();
    expect(after.filter((r) => r.from_id === r.to_id)).toEqual([]);
    expect(after).toEqual([{ code: 'B-TO-M', from_id: PID.B, to_id: PID.M }]);
  });

  it('replaying the merge log restores every note, including the dropped ones', async () => {
    await note('A-TO-M', PID.A, PID.M);
    await note('B-TO-M', PID.B, PID.M);
    await note('A-TO-B', PID.A, PID.B);
    await note('B-TO-A', PID.B, PID.A);
    await note('A-TO-C', PID.A, PID.C);
    const before = await refs();

    expect((await merge(PID.A, PID.B)).status).toBe(204);
    await replay();

    expect(await refs()).toEqual(before);
  });
});
