import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { getDb } from '@cc/api-db/client';
import { linkZaloSlots } from '../src/auth/zaloSlots';
import { sha256Hex } from '@cc/api-util/ids';
import { call, json, memberSid, seedTrip, seedUser, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const db = () => getDb(env);

async function sql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function zaloSubOf(pid: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT zalo_sub FROM participants WHERE id = ?').bind(pid).first<{ zalo_sub: string | null }>();
  return row!.zalo_sub;
}

async function userIdOf(pid: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT user_id FROM participants WHERE id = ?').bind(pid).first<{ user_id: string | null }>();
  return row!.user_id;
}

/** Guest headers for a device with a known id, optionally tied to a Zalo account. */
async function deviceHeaders(deviceId: string, zaloSub: string | null): Promise<Record<string, string>> {
  const now = new Date().toISOString();
  await sql('INSERT OR REPLACE INTO devices (id_hash, zalo_sub, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
    await sha256Hex(deviceId), zaloSub, now, now);
  return { 'X-Device-Restore': deviceId, 'X-Link-Token': T.groupToken };
}

const pick = (headers: Record<string, string>, participantId: string) =>
  call(`${base}/people/pick`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantId }),
  });

beforeEach(seedTrip);

describe('Zalo-tied slots: pick', () => {
  it("pick copies the device's zalo_sub onto the slot", async () => {
    const h = await deviceHeaders('dev-zalo-an', 'z-an');
    expect((await pick(h, PID.A)).status).toBe(204);
    expect(await zaloSubOf(PID.A)).toBe('z-an');
  });

  it('pick never overwrites zalo_sub', async () => {
    await sql("UPDATE participants SET zalo_sub = 'z-other' WHERE id = ?", PID.A);
    const h = await deviceHeaders('dev-zalo-an', 'z-an');
    expect((await pick(h, PID.A)).status).toBe(204);
    expect(await zaloSubOf(PID.A)).toBe('z-other');
  });

  it('pick from a plain device writes no zalo_sub', async () => {
    const h = await deviceHeaders('dev-plain', null);
    expect((await pick(h, PID.A)).status).toBe(204);
    expect(await zaloSubOf(PID.A)).toBeNull();
  });

  it('pick still works when another slot in the group holds the zalo_sub', async () => {
    await sql("UPDATE participants SET zalo_sub = 'z-an' WHERE id = ?", PID.C);
    const h = await deviceHeaders('dev-zalo-an', 'z-an');
    expect((await pick(h, PID.A)).status).toBe(204);
    expect(await zaloSubOf(PID.A)).toBeNull();
    expect(await zaloSubOf(PID.C)).toBe('z-an');
  });
});

describe('Zalo-tied slots: recognition', () => {
  it('a Zalo device is recognised on its slot without picking', async () => {
    await sql("UPDATE participants SET zalo_sub = 'z-binh' WHERE id = ?", PID.B);
    const h = await deviceHeaders('dev-zalo-binh', 'z-binh');
    const res = await call(`${base}/people/picker`, { headers: h });
    expect(res.status).toBe(200);
    expect((await json<{ myPick: string | null }>(res)).myPick).toBe(PID.B);
    const dp = await env.DB.prepare('SELECT participant_id FROM device_participants WHERE device_hash = ? AND trip_id = ?')
      .bind(await sha256Hex('dev-zalo-binh'), T.tripId).first<{ participant_id: string }>();
    expect(dp?.participant_id).toBe(PID.B);
  });

  it("a device's own pick wins over its Zalo slot", async () => {
    await sql("UPDATE participants SET zalo_sub = 'z-binh' WHERE id = ?", PID.B);
    const h = await deviceHeaders('dev-zalo-binh', 'z-binh');
    await sql('INSERT INTO device_participants (device_hash, trip_id, participant_id, last_used_at) VALUES (?, ?, ?, ?)',
      await sha256Hex('dev-zalo-binh'), T.tripId, PID.A, new Date().toISOString());
    const res = await call(`${base}/people/picker`, { headers: h });
    expect((await json<{ myPick: string | null }>(res)).myPick).toBe(PID.A);
  });
});

describe('Zalo-tied slots: linkZaloSlots', () => {
  it('linkZaloSlots makes the slot a membership', async () => {
    await seedUser('u-chi', 'Chi');
    await sql("UPDATE participants SET zalo_sub = 'z-chi' WHERE id = ?", PID.C);
    expect(await linkZaloSlots(db(), 'u-chi', 'z-chi')).toBe(1);
    expect(await userIdOf(PID.C)).toBe('u-chi');
    const reqs = await env.DB.prepare('SELECT id FROM membership_requests').all();
    expect(reqs.results).toEqual([]);
  });

  it('linkZaloSlots skips a group where the user already has a slot', async () => {
    await seedUser('u-chi', 'Chi');
    await sql("UPDATE participants SET user_id = 'u-chi' WHERE id = ?", PID.B);
    await sql("UPDATE participants SET zalo_sub = 'z-chi' WHERE id = ?", PID.C);
    expect(await linkZaloSlots(db(), 'u-chi', 'z-chi')).toBe(0);
    expect(await userIdOf(PID.C)).toBeNull();
  });

  it('linkZaloSlots ignores pending and merged slots', async () => {
    await seedUser('u-chi', 'Chi');
    await sql("UPDATE participants SET zalo_sub = 'z-chi', status = 'pending' WHERE id = ?", PID.C);
    await sql("INSERT INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES ('t-2', 'Other', 'VND', 1, ?, 'gtok-2', 'vtok-2', 0, '2026-10-12T00:00:00.000Z')", U.minh);
    await sql("INSERT INTO participants (id, trip_id, name, normalized_name, zalo_sub, status, merged_into, sort_order, created_at) VALUES ('p-x', 't-2', 'Chi', 'chi', 'z-chi', 'merged', ?, 0, '2026-10-12T00:00:00.000Z')", PID.C);
    expect(await linkZaloSlots(db(), 'u-chi', 'z-chi')).toBe(0);
    expect(await userIdOf(PID.C)).toBeNull();
    expect(await userIdOf('p-x')).toBeNull();
  });
});

describe('Zalo-tied slots: merge', () => {
  it('merge carries zalo_sub to the survivor', async () => {
    await sql("UPDATE participants SET zalo_sub = 'z-chi' WHERE id = ?", PID.C);
    const res = await call(`${base}/people/merge`, {
      method: 'POST',
      headers: { Cookie: `sid=${await memberSid(U.minh, 'Minh')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromId: PID.C, intoId: PID.B }),
    });
    expect(res.status).toBe(204);
    expect(await zaloSubOf(PID.B)).toBe('z-chi');
    expect(await zaloSubOf(PID.C)).toBeNull();
  });
});
