import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { call, json, seedTrip, memberSid, guestHeaders, T, U } from './helpers';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(seedTrip);

describe('claiming a name still waiting for approval', () => {
  it('a guest who added their own name can claim it, and approval links it', async () => {
    const pid = 'p-dung-pending';
    await env.DB.prepare("INSERT INTO participants (id, trip_id, name, normalized_name, status, sort_order, created_at) VALUES (?, ?, 'Dũng', 'dung', 'pending', 10, '2026-10-12T00:00:00.000Z')")
      .bind(pid, T.tripId).run();
    const sid = await memberSid('u-dung', 'Dũng');
    const g = await guestHeaders(pid);

    const claim = await post('/membership', { ...g, Cookie: `${g.Cookie}; sid=${sid}` }, { participantId: pid });
    expect(claim.status).toBe(201);
    const { requestId } = await json<{ requestId: string }>(claim);

    const minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    expect((await post(`/membership/${requestId}/approve`, minh)).status).toBe(204);
    const row = await env.DB.prepare('SELECT user_id FROM participants WHERE id = ?').bind(pid).first<{ user_id: string }>();
    expect(row?.user_id).toBe('u-dung');
  });

  it('a second claim on the same pending name is refused', async () => {
    const pid = 'p-dung-pending';
    await env.DB.prepare("INSERT INTO participants (id, trip_id, name, normalized_name, status, sort_order, created_at) VALUES (?, ?, 'Dũng', 'dung', 'pending', 10, '2026-10-12T00:00:00.000Z')")
      .bind(pid, T.tripId).run();
    const one = await guestHeaders(pid);
    const two = await guestHeaders(pid);
    const sid1 = await memberSid('u-c1', 'c1');
    const sid2 = await memberSid('u-c2', 'c2');
    const results = await Promise.all([
      post('/membership', { ...one, Cookie: `${one.Cookie}; sid=${sid1}` }, { participantId: pid }),
      post('/membership', { ...two, Cookie: `${two.Cookie}; sid=${sid2}` }, { participantId: pid }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });
});
