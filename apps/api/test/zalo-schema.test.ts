import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { seedTrip, T, U, PID } from './helpers';

beforeEach(seedTrip);

describe('zalo schema (0013)', () => {
  it('two slots in one group cannot share a zalo_sub', async () => {
    await env.DB.prepare('UPDATE participants SET zalo_sub = ? WHERE id = ?').bind('z1', PID.A).run();
    await expect(
      env.DB.prepare('UPDATE participants SET zalo_sub = ? WHERE id = ?').bind('z1', PID.B).run(),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('the same zalo_sub may appear in different groups', async () => {
    await env.DB.prepare('UPDATE participants SET zalo_sub = ? WHERE id = ?').bind('z1', PID.A).run();
    await env.DB.prepare(
      'INSERT INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, 1, ?, ?, ?, 0, ?)',
    )
      .bind('t-2', 'Trip 2', 'VND', U.minh, 'gtok-2', 'vtok-2', '2026-10-12T00:00:00.000Z')
      .run();
    await env.DB.prepare(
      "INSERT INTO participants (id, trip_id, name, normalized_name, zalo_sub, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 'active', 0, ?)",
    )
      .bind('p-t2-a', 't-2', 'An', 'an', 'z1', '2026-10-12T00:00:00.000Z')
      .run();
    const row = await env.DB.prepare('SELECT zalo_sub FROM participants WHERE id = ?')
      .bind('p-t2-a')
      .first<{ zalo_sub: string }>();
    expect(row?.zalo_sub).toBe('z1');
  });

  it('zalo_chat_links stores a row', async () => {
    const now = '2026-11-01T00:00:00.000Z';
    await env.DB.prepare(
      'INSERT INTO zalo_chat_links (chat_id, trip_id, linked_by_user_id, created_at) VALUES (?, ?, ?, ?)',
    )
      .bind('chat-1', T.tripId, U.minh, now)
      .run();
    const row = await env.DB.prepare(
      'SELECT chat_id, trip_id, linked_by_user_id, created_at FROM zalo_chat_links WHERE chat_id = ?',
    )
      .bind('chat-1')
      .first<{ chat_id: string; trip_id: string; linked_by_user_id: string; created_at: string }>();
    expect(row).toEqual({
      chat_id: 'chat-1',
      trip_id: T.tripId,
      linked_by_user_id: U.minh,
      created_at: now,
    });
  });

  it('devices has zalo_sub', async () => {
    const now = '2026-11-01T00:00:00.000Z';
    await env.DB.prepare('INSERT INTO devices (id_hash, zalo_sub, created_at, last_seen_at) VALUES (?, ?, ?, ?)')
      .bind('dev-1', 'z2', now, now)
      .run();
    const row = await env.DB.prepare('SELECT zalo_sub FROM devices WHERE id_hash = ?')
      .bind('dev-1')
      .first<{ zalo_sub: string }>();
    expect(row?.zalo_sub).toBe('z2');
  });
});
