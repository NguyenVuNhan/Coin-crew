import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { ZaloChatLookup } from '@cc/core';
import { sha256Hex } from '../src/lib/ids';
import { call, json, memberSid, seedTrip, seedUser, T, U, PID } from './helpers';

async function zaloGuestDevice(id = 'dev-zalo-guest') {
  const hash = await sha256Hex(id);
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT OR REPLACE INTO devices (id_hash, zalo_sub, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
  )
    .bind(hash, 'z-guest', now, now)
    .run();
  return { 'X-Device-Restore': id };
}

beforeEach(async () => {
  await seedTrip();
  await env.DB.prepare('DELETE FROM zalo_chat_links').run();
});

describe('zalo chats API', () => {
  it('lookup needs a verified Zalo identity', async () => {
    // plain device, no session -> 401
    const res1 = await call('/api/zalo/chats/chat-1');
    expect(res1.status).toBe(401);
    expect((await json<{ error: { code: string } }>(res1)).error.code).toBe('UNAUTHENTICATED');

    // Zalo guest device -> 200 { linked: false }
    const guestHeaders = await zaloGuestDevice();
    const res2 = await call('/api/zalo/chats/chat-1', { headers: guestHeaders });
    expect(res2.status).toBe(200);
    expect(await json<ZaloChatLookup>(res2)).toEqual({ linked: false });
  });

  it('link then lookup', async () => {
    const sid = await memberSid(U.minh, 'Minh');
    const postRes = await call('/api/zalo/chats/chat-1/link', {
      method: 'POST',
      headers: {
        Cookie: `sid=${sid}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tripId: T.tripId }),
    });
    expect(postRes.status).toBe(204);

    const guestHeaders = await zaloGuestDevice();
    const getRes = await call('/api/zalo/chats/chat-1', { headers: guestHeaders });
    expect(getRes.status).toBe(200);
    expect(await json<ZaloChatLookup>(getRes)).toEqual({
      linked: true,
      tripId: T.tripId,
      tripName: 'Đà Lạt · Oct 2026',
      joinToken: T.groupToken,
      isMember: false,
    });
  });

  it('only members may link', async () => {
    // a signed-in user who is not in the trip -> 403
    const sid = await memberSid('u-other', 'Other User');
    const res1 = await call('/api/zalo/chats/chat-1/link', {
      method: 'POST',
      headers: {
        Cookie: `sid=${sid}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tripId: T.tripId }),
    });
    expect(res1.status).toBe(403);

    // Zalo guest device without session -> 401
    const guestHeaders = await zaloGuestDevice();
    const res2 = await call('/api/zalo/chats/chat-1/link', {
      method: 'POST',
      headers: {
        ...guestHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tripId: T.tripId }),
    });
    expect(res2.status).toBe(401);
  });

  it('relinking', async () => {
    // seed trip t-2 organised by U.an (insert trip + An as participant with user_id U.an, like seedTrip does)
    await seedUser(U.an, 'An');
    await env.DB.prepare(
      'INSERT OR IGNORE INTO trips (id, name, currency, fewest_transfers, organiser_user_id, group_token, view_token, version, created_at) VALUES (?, ?, ?, 1, ?, ?, ?, 0, ?)',
    )
      .bind('t-2', 'Trip 2', 'VND', U.an, 'gtok-2', 'vtok-2', '2026-10-12T00:00:00.000Z')
      .run();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO participants (id, trip_id, name, normalized_name, user_id, status, sort_order, created_at) VALUES (?, ?, ?, ?, ?, 'active', 0, ?)",
    )
      .bind('p-an-t2', 't-2', 'An', 'an', U.an, '2026-10-12T00:00:00.000Z')
      .run();

    // chat-1 linked to T.tripId by Minh
    const minhSid = await memberSid(U.minh, 'Minh');
    const minhHeaders = {
      Cookie: `sid=${minhSid}`,
      'Content-Type': 'application/json',
    };
    const res1 = await call('/api/zalo/chats/chat-1/link', {
      method: 'POST',
      headers: minhHeaders,
      body: JSON.stringify({ tripId: T.tripId }),
    });
    expect(res1.status).toBe(204);

    // An links chat-1 to t-2 -> 409
    const anSid = await memberSid(U.an, 'An');
    const anHeaders = {
      Cookie: `sid=${anSid}`,
      'Content-Type': 'application/json',
    };
    const res2 = await call('/api/zalo/chats/chat-1/link', {
      method: 'POST',
      headers: anHeaders,
      body: JSON.stringify({ tripId: 't-2' }),
    });
    expect(res2.status).toBe(409);

    // Minh links chat-1 to T.tripId again -> 204
    const res3 = await call('/api/zalo/chats/chat-1/link', {
      method: 'POST',
      headers: minhHeaders,
      body: JSON.stringify({ tripId: T.tripId }),
    });
    expect(res3.status).toBe(204);
  });

  it('unlink is admin-only', async () => {
    // link chat-1 to T.tripId by Minh first
    const minhSid = await memberSid(U.minh, 'Minh');
    const minhHeaders = {
      Cookie: `sid=${minhSid}`,
      'Content-Type': 'application/json',
    };
    const linkRes = await call('/api/zalo/chats/chat-1/link', {
      method: 'POST',
      headers: minhHeaders,
      body: JSON.stringify({ tripId: T.tripId }),
    });
    expect(linkRes.status).toBe(204);

    // give PID.A user_id U.an (plain member, not admin)
    await seedUser(U.an, 'An');
    await env.DB.prepare('UPDATE participants SET user_id = ? WHERE id = ?').bind(U.an, PID.A).run();

    // An DELETE -> 403
    const anSid = await memberSid(U.an, 'An');
    const res1 = await call('/api/zalo/chats/chat-1', {
      method: 'DELETE',
      headers: { Cookie: `sid=${anSid}` },
    });
    expect(res1.status).toBe(403);

    // Minh -> 204
    const res2 = await call('/api/zalo/chats/chat-1', {
      method: 'DELETE',
      headers: { Cookie: `sid=${minhSid}` },
    });
    expect(res2.status).toBe(204);

    // then Zalo device GET -> { linked: false }
    const guestHeaders = await zaloGuestDevice();
    const res3 = await call('/api/zalo/chats/chat-1', { headers: guestHeaders });
    expect(res3.status).toBe(200);
    expect(await json<ZaloChatLookup>(res3)).toEqual({ linked: false });
  });

  it("admins list a group's chats", async () => {
    const minhSid = await memberSid(U.minh, 'Minh');
    const minhHeaders = {
      Cookie: `sid=${minhSid}`,
      'Content-Type': 'application/json',
    };
    await call('/api/zalo/chats/chat-1/link', {
      method: 'POST',
      headers: minhHeaders,
      body: JSON.stringify({ tripId: T.tripId }),
    });

    const res = await call(`/api/trips/${T.tripId}/zalo-chats`, {
      headers: { Cookie: `sid=${minhSid}` },
    });
    expect(res.status).toBe(200);
    const body = await json<{ chats: { chatId: string; createdAt: string }[] }>(res);
    expect(body.chats.some((c) => c.chatId === 'chat-1')).toBe(true);
  });

  it('chat id longer than 64 chars -> 422', async () => {
    const longChatId = 'a'.repeat(65);
    const res = await call(`/api/zalo/chats/${longChatId}`);
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body).toEqual({
      error: { code: 'VALIDATION', message: 'Invalid chat id' },
    });
  });
});
