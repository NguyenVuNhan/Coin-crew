import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { call, json, seedTrip, seedExpenses, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });

type MergeRow = { merge_id: string; table_name: string; row_key: string; before_json: string };

async function shareSnapshot() {
  const { results } = await env.DB.prepare(
    'SELECT transaction_id, participant_id, amount, input_value, input_auto FROM transaction_shares ORDER BY transaction_id, participant_id',
  ).all();
  return results;
}

/** Writes every logged row back as it was before the merge. */
async function replay(rows: MergeRow[]) {
  for (const r of rows) {
    const before = JSON.parse(r.before_json) as Record<string, unknown>;
    const cols = Object.keys(before);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO ${r.table_name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    ).bind(...cols.map((c) => before[c])).run();
  }
}

beforeEach(seedTrip);

describe('merge log', () => {
  it('records the merge and the rows it changed, and replaying them restores the totals', async () => {
    await seedExpenses();
    const original = await shareSnapshot();
    const originalTotal = original.reduce((s, r) => s + (r.amount as number), 0);

    expect((await post('/people/merge', await minh(), { fromId: PID.B, intoId: PID.A })).status).toBe(204);

    const merge = await env.DB.prepare('SELECT * FROM participant_merges').first<{ id: string; trip_id: string; from_id: string; into_id: string; actor_user_id: string }>();
    expect(merge).toMatchObject({ trip_id: T.tripId, from_id: PID.B, into_id: PID.A, actor_user_id: U.minh });

    const { results: rows } = await env.DB.prepare('SELECT * FROM participant_merge_rows WHERE merge_id = ?').bind(merge!.id).all<MergeRow>();
    const shareRows = rows.filter((r) => r.table_name === 'transaction_shares');
    const e1 = shareRows
      .map((r) => ({ key: JSON.parse(r.row_key), before: JSON.parse(r.before_json) }))
      .filter((r) => r.key.transaction_id === 'e-1');
    const bin = e1.find((r) => r.key.participant_id === PID.B);
    const an = e1.find((r) => r.key.participant_id === PID.A);
    expect(bin?.before.amount).toBe(800000);
    expect(an?.before.amount).toBe(800000);

    // Bình's participant row is logged as it was (active).
    const binhRow = rows.find((r) => r.table_name === 'participants' && JSON.parse(r.row_key).id === PID.B);
    expect(JSON.parse(binhRow!.before_json).status).toBe('active');

    await replay(rows);
    const restored = await shareSnapshot();
    expect(restored.reduce((s, r) => s + (r.amount as number), 0)).toBe(originalTotal);
    expect(restored).toEqual(original);
    const e3 = await env.DB.prepare("SELECT payer_id FROM transactions WHERE id = 'e-3'").first<{ payer_id: string }>();
    expect(e3?.payer_id).toBe(PID.B);
  });

  it('logs merges that touch more rows than one statement can bind', async () => {
    for (let i = 0; i < 60; i++) {
      const id = `bulk-${i}`;
      await env.DB.prepare("INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', 'x', 1000, 'VND', '2026-10-10', ?, 'equal', 'approved', ?, '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z')")
        .bind(id, id, T.tripId, PID.M, PID.M).run();
      await env.DB.prepare('INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, 1000)').bind(id, PID.B).run();
    }
    expect((await post('/people/merge', await minh(), { fromId: PID.B, intoId: PID.A })).status).toBe(204);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM participant_merge_rows WHERE table_name = 'transaction_shares'").first<{ n: number }>();
    expect(count?.n).toBe(60);
  });

  it('refuses to merge while either person has a pending claim', async () => {
    const anSid = await memberSid('u-an-2', 'An Trần');
    const g = await guestHeaders(PID.A);
    expect((await post('/membership', { ...g, Cookie: `${g.Cookie}; sid=${anSid}` }, { participantId: PID.A })).status).toBe(201);

    const headers = await minh();
    for (const body of [{ fromId: PID.B, intoId: PID.A }, { fromId: PID.A, intoId: PID.C }]) {
      const res = await post('/people/merge', headers, body);
      expect(res.status).toBe(409);
      expect(await json(res)).toMatchObject({ error: { code: 'CONFLICT', message: 'CLAIM_PENDING' } });
    }
    const merges = await env.DB.prepare('SELECT COUNT(*) AS n FROM participant_merges').first<{ n: number }>();
    expect(merges?.n).toBe(0);
    const b = await env.DB.prepare('SELECT status FROM participants WHERE id = ?').bind(PID.B).first<{ status: string }>();
    expect(b?.status).toBe('active');
  });
});
