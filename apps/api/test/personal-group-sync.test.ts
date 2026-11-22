import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { SyncResponse } from '@cc/core';
import { call, json, memberSid, PID, seedTrip, T, U } from './helpers';
import { postJson, switchOn } from './personal-helpers';

const as = (sid: string) => ({ headers: { Cookie: `sid=${sid}` } });

const getSync = (sid: string, query = '') =>
  call(`/api/me/personal/sync${query ? `${query}&groups=show` : '?groups=show'}`, as(sid));

afterEach(async () => {
  await env.DB.prepare('DELETE FROM personal_group_link_tags').run();
  await env.DB.prepare('DELETE FROM personal_group_links').run();
  await env.DB.prepare('DELETE FROM personal_sync_deletions').run();
  await env.DB.prepare('DELETE FROM personal_sync_state').run();
  await env.DB.prepare('DELETE FROM personal_transactions').run();
  await env.DB.prepare('DELETE FROM personal_wallets').run();
  await env.DB.prepare('DELETE FROM transaction_shares').run();
  await env.DB.prepare('DELETE FROM transactions').run();
  await env.DB.prepare('DELETE FROM participants').run();
  await env.DB.prepare('DELETE FROM trips').run();
});

describe('personal sync group rows GET /me/personal/sync', () => {
  it('without groups=show the response has no groups field', async () => {
    const sid = await memberSid('u-sync-nogroups');
    await switchOn('u-sync-nogroups');
    const body = await json<SyncResponse>(await call('/api/me/personal/sync', as(sid)));
    expect('groups' in body).toBe(false);
  });

  it('first sync returns groups', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh);

    const expRes = await postJson(`/api/trips/${T.tripId}/expenses`, sid, {
      description: 'Lẩu gà lá é',
      amount: 300_000,
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

    const res = await getSync(sid);
    expect(res.status).toBe(200);
    const data = await json<SyncResponse>(res);

    expect(data.status).toBe('reset');
    expect(data.groups).toBeTruthy();
    expect(typeof data.groups!.key).toBe('string');
    expect(data.groups!.key.length).toBeGreaterThan(0);
    expect(data.groups!.rows).toHaveLength(1);
    expect(data.groups!.rows[0]).toMatchObject({
      kind: 'group',
      tripId: T.tripId,
      title: 'Lẩu gà lá é',
      total: 300_000,
      myShare: 100_000,
      iPaid: false,
    });
  });

  it('same key -> groups: null and current', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh);

    await postJson(`/api/trips/${T.tripId}/expenses`, sid, {
      description: 'Coffee',
      amount: 90_000,
      spentOn: '2026-11-10',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
        { participantId: PID.B, value: 1 },
      ],
    });

    const first = await json<SyncResponse>(await getSync(sid));
    expect(first.status).toBe('reset');
    const ledgerVer = first.ledger?.version ?? 0;
    const groupsKey = first.groups!.key;

    const secondRes = await getSync(
      sid,
      `?epoch=${encodeURIComponent(first.epoch)}&since=${first.version}&ledgerVersion=${ledgerVer}&groupsKey=${encodeURIComponent(groupsKey)}`,
    );
    expect(secondRes.status).toBe(200);
    const second = await json<SyncResponse>(secondRes);

    expect(second.status).toBe('current');
    expect(second.groups).toBeNull();
    expect(second.entries).toEqual([]);
  });

  it('an expense added in one group -> new key, rows returned', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh);

    await postJson(`/api/trips/${T.tripId}/expenses`, sid, {
      description: 'First dinner',
      amount: 200_000,
      spentOn: '2026-11-10',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
      ],
    });

    const first = await json<SyncResponse>(await getSync(sid));
    const ledgerVer = first.ledger?.version ?? 0;
    const oldKey = first.groups!.key;
    expect(first.groups!.rows).toHaveLength(1);

    const addRes = await postJson(`/api/trips/${T.tripId}/expenses`, sid, {
      description: 'Second breakfast',
      amount: 120_000,
      spentOn: '2026-11-11',
      payerId: PID.A,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
      ],
    });
    expect(addRes.status).toBe(201);

    const nextRes = await getSync(
      sid,
      `?epoch=${encodeURIComponent(first.epoch)}&since=${first.version}&ledgerVersion=${ledgerVer}&groupsKey=${encodeURIComponent(oldKey)}`,
    );
    expect(nextRes.status).toBe(200);
    const next = await json<SyncResponse>(nextRes);

    expect(next.status).toBe('delta');
    expect(next.groups).not.toBeNull();
    expect(next.groups!.key).not.toBe(oldKey);
    expect(next.groups!.rows).toHaveLength(2);
    expect(next.groups!.rows.map((r) => r.title)).toContain('Second breakfast');
  });

  it('a link write -> new key', async () => {
    await seedTrip();
    const sid = await memberSid(U.minh, 'Minh');
    await switchOn(U.minh);

    await postJson(`/api/trips/${T.tripId}/expenses`, sid, {
      description: 'Shared cab',
      amount: 100_000,
      spentOn: '2026-11-10',
      payerId: PID.M,
      mode: 'equal',
      entries: [
        { participantId: PID.M, value: 1 },
        { participantId: PID.A, value: 1 },
      ],
    });

    const first = await json<SyncResponse>(await getSync(sid));
    const ledgerVer = first.ledger?.version ?? 0;
    const oldKey = first.groups!.key;
    const rootId = first.groups!.rows[0]!.rootId;

    await env.DB.prepare(
      `INSERT INTO personal_group_links (user_id, root_id, trip_id, intent, exclude_from_reports, created_at, updated_at, sync_version)
       VALUES (?, ?, ?, 'loan', 1, '2026-11-10T10:00:00.000Z', '2026-11-10T10:00:00.000Z', 1)`,
    )
      .bind(U.minh, rootId, T.tripId)
      .run();

    const nextRes = await getSync(
      sid,
      `?epoch=${encodeURIComponent(first.epoch)}&since=${first.version}&ledgerVersion=${ledgerVer}&groupsKey=${encodeURIComponent(oldKey)}`,
    );
    expect(nextRes.status).toBe(200);
    const next = await json<SyncResponse>(nextRes);

    expect(next.status).toBe('delta');
    expect(next.groups).not.toBeNull();
    expect(next.groups!.key).not.toBe(oldKey);
    expect(next.groups!.rows).toHaveLength(1);
    expect(next.groups!.rows[0]!.link).toMatchObject({
      intent: 'loan',
      excludeFromReports: true,
    });
  });
});
