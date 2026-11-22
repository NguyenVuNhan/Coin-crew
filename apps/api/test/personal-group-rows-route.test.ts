import { afterEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import type { GroupRow } from '@cc/core';
import { call, json, memberSid, PID, seedTrip, T, U } from './helpers';
import { postJson, switchOn } from './personal-helpers';

type GroupRowsResponse =
  | { status: 'current' }
  | { status: 'rows'; key: string; rows: GroupRow[] };

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getGroupRows = (sid: string, key?: string) =>
  call(
    key !== undefined
      ? `/api/me/personal/group-rows?key=${encodeURIComponent(key)}`
      : '/api/me/personal/group-rows',
    as(sid),
  );

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_group_link_tags').run();
  await env.DB.prepare('DELETE FROM personal_group_links').run();
  await env.DB.prepare('DELETE FROM personal_group_settings').run();
  await env.DB.prepare('DELETE FROM personal_sync_deletions').run();
  await env.DB.prepare('DELETE FROM personal_sync_state').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM personal_categories').run();
  await env.DB.prepare('DELETE FROM personal_tags').run();
  await env.DB.prepare('DELETE FROM transaction_shares').run();
  await env.DB.prepare('DELETE FROM transactions').run();
  await env.DB.prepare('DELETE FROM participants').run();
  await env.DB.prepare('DELETE FROM trips').run();
});

describe('GET /api/me/personal/group-rows', () => {
  it('returns rows on first fetch and current when key matches', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh);

    const expRes = await postJson(`/api/trips/${T.tripId}/expenses`, sid, {
      description: 'Taxi',
      amount: 240_000,
      spentOn: '2026-11-10',
      payerId: PID.A,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
        { participantId: PID.B, value: 1 },
      ],
    });
    expect(expRes.status).toBe(201);

    const firstRes = await getGroupRows(sid);
    expect(firstRes.status).toBe(200);
    const first = await json<GroupRowsResponse>(firstRes);
    expect(first.status).toBe('rows');
    if (first.status !== 'rows') throw new Error('expected rows');
    expect(typeof first.key).toBe('string');
    expect(first.key.length).toBeGreaterThan(0);
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0]).toMatchObject({
      kind: 'group',
      tripId: T.tripId,
      title: 'Taxi',
      total: 240_000,
      myShare: 80_000,
      iPaid: false,
    });

    const secondRes = await getGroupRows(sid, first.key);
    expect(secondRes.status).toBe(200);
    const second = await json<GroupRowsResponse>(secondRes);
    expect(second).toEqual({ status: 'current' });
  });

  it('key changes and returns updated rows after a group expense edit', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh);

    const createRes = await postJson(`/api/trips/${T.tripId}/expenses`, sid, {
      description: 'Taxi',
      amount: 240_000,
      spentOn: '2026-11-10',
      payerId: PID.A,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
        { participantId: PID.B, value: 1 },
      ],
    });
    expect(createRes.status).toBe(201);

    const first = await json<GroupRowsResponse>(await getGroupRows(sid));
    if (first.status !== 'rows') throw new Error('expected rows');
    const oldKey = first.key;
    const expId = first.rows[0]!.id;

    const editRes = await postJson(
      `/api/trips/${T.tripId}/expenses/${expId}`,
      sid,
      {
        description: 'Taxi sân bay',
        amount: 300_000,
        spentOn: '2026-11-10',
        payerId: PID.A,
        mode: 'equal',
        entries: [
          { participantId: PID.M, value: 1 },
          { participantId: PID.A, value: 1 },
          { participantId: PID.B, value: 1 },
        ],
      },
      'PATCH',
    );
    expect(editRes.status).toBe(200);

    const nextRes = await getGroupRows(sid, oldKey);
    expect(nextRes.status).toBe(200);
    const next = await json<GroupRowsResponse>(nextRes);
    expect(next.status).toBe('rows');
    if (next.status !== 'rows') throw new Error('expected rows');
    expect(next.key).not.toBe(oldKey);
    expect(next.rows).toHaveLength(1);
    expect(next.rows[0]).toMatchObject({
      title: 'Taxi sân bay',
      total: 300_000,
      myShare: 100_000,
    });
  });

  it('key changes and returns updated rows after a link write', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh);

    await postJson(`/api/trips/${T.tripId}/expenses`, sid, {
      description: 'Bữa tối',
      amount: 200_000,
      spentOn: '2026-11-10',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
      ],
    });

    const first = await json<GroupRowsResponse>(await getGroupRows(sid));
    if (first.status !== 'rows') throw new Error('expected rows');
    const oldKey = first.key;
    const rootId = first.rows[0]!.rootId;

    const putRes = await postJson(
      `/api/me/personal/group-links/${rootId}`,
      sid,
      { intent: 'loan', excludeFromReports: true },
      'PUT',
    );
    expect(putRes.status).toBe(200);

    const nextRes = await getGroupRows(sid, oldKey);
    expect(nextRes.status).toBe(200);
    const next = await json<GroupRowsResponse>(nextRes);
    expect(next.status).toBe('rows');
    if (next.status !== 'rows') throw new Error('expected rows');
    expect(next.key).not.toBe(oldKey);
    expect(next.rows).toHaveLength(1);
    expect(next.rows[0]!.link).toMatchObject({
      intent: 'loan',
      excludeFromReports: true,
    });
  });

  it('returns 403 when personal area is switched off', async () => {
    const sid = await memberSid('u-group-rows-off', 'OffUser');
    const res = await getGroupRows(sid);
    expect(res.status).toBe(403);
  });
});
