import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { getDb } from '@cc/api-db/client';
import { ApiError } from '@cc/api-util/errors';
import { mergeParticipants } from '../src/participants/merge';
import { call, json, seedTrip, memberSid, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });

const NEW = 'p-new';

async function seedPendingName() {
  await env.DB.prepare("INSERT INTO participants (id, trip_id, name, normalized_name, status, sort_order, created_at) VALUES (?, ?, 'An mới', 'an moi', 'pending', 10, '2026-10-12T00:00:00.000Z')")
    .bind(NEW, T.tripId).run();
}

async function count(sql: string) {
  return (await env.DB.prepare(sql).first<{ n: number }>())?.n;
}

async function expectMergedOnce() {
  expect(await count('SELECT COUNT(*) AS n FROM participant_merges')).toBe(1);
  expect(await count("SELECT COUNT(*) AS n FROM activity WHERE action = 'name_merged'")).toBe(1);
  const row = await env.DB.prepare('SELECT status, merged_into FROM participants WHERE id = ?').bind(NEW).first<{ status: string; merged_into: string }>();
  expect(row).toEqual({ status: 'merged', merged_into: PID.A });
}

beforeEach(async () => {
  await seedTrip();
  await seedPendingName();
});

describe('"Same as X" approval merges once', () => {
  it('two concurrent Same-as approvals merge once', async () => {
    const headers = await minh();
    const results = await Promise.all([
      post(`/people/${NEW}/approve`, headers, { sameAs: PID.A }),
      post(`/people/${NEW}/approve`, headers, { sameAs: PID.A }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(await json(loser)).toEqual({ error: { code: 'ALREADY_HANDLED', message: 'Someone already handled this.' } });
    await expectMergedOnce();
  });

  it('second Same-as approval after the first is ALREADY_HANDLED', async () => {
    const headers = await minh();
    expect((await post(`/people/${NEW}/approve`, headers, { sameAs: PID.A })).status).toBe(204);
    const again = await post(`/people/${NEW}/approve`, headers, { sameAs: PID.A });
    expect(again.status).toBe(409);
    expect(await json(again)).toEqual({ error: { code: 'ALREADY_HANDLED', message: 'Someone already handled this.' } });
    await expectMergedOnce();
  });

  it('two concurrent direct merges of the same pair: the batch guard lets only one through', async () => {
    const db = getDb(env);
    const actor = { userId: U.minh, participantId: PID.M, deviceHash: 'd-test' };
    const outcomes = await Promise.allSettled([
      mergeParticipants(db, T.tripId, NEW, PID.A, actor),
      mergeParticipants(db, T.tripId, NEW, PID.A, actor),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((o): o is PromiseRejectedResult => o.status === 'rejected')!;
    expect(rejected.reason).toBeInstanceOf(ApiError);
    // Either the pre-check (422) or the batch guard (409 ALREADY_HANDLED) refused it; never a second merge.
    const err = rejected.reason as ApiError;
    expect(['ALREADY_HANDLED', 'VALIDATION']).toContain(err.code);
    await expectMergedOnce();
  });
});
