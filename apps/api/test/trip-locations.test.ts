import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { TripLocationView, TripView } from '@cc/core';
import { call, json, seedTrip, memberSid, guestHeaders, linkMember, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });

beforeEach(async () => {
  await seedTrip();
  await env.DB.prepare("UPDATE trips SET preset = 'sport' WHERE id = ?").bind(T.tripId).run();
});

describe('trip locations CRUD & TripView integration', () => {
  it('allows an admin to create, update, and delete a saved location and exposes it in TripView', async () => {
    const headers = await minh();
    const createRes = await call(`${base}/locations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sân Cầu Lông Putin - 158 Phú Diễn',
        address: '158 Phú Diễn, Phường Phú Diễn, Hà Nội',
        phone: '0345747800',
        mapUrl: 'https://maps.app.goo.gl/xyz123',
      }),
    });
    expect(createRes.status).toBe(201);
    const { location } = await json<{ location: TripLocationView }>(createRes);
    expect(location.name).toBe('Sân Cầu Lông Putin - 158 Phú Diễn');

    const v1 = await json<TripView>(call(base, { headers }));
    expect(v1.locations).toHaveLength(1);
    expect(v1.locations?.[0]?.phone).toBe('0345747800');
    expect(v1.aiBookingExtract).toBe(false);

    const patchRes = await call(`${base}/locations/${location.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sân Putin Cơ Sở 1', address: '158 Phú Diễn, Hà Nội' }),
    });
    expect(patchRes.status).toBe(200);

    const delRes = await call(`${base}/locations/${location.id}`, { method: 'DELETE', headers });
    expect(delRes.status).toBe(200);

    const v2 = await json<TripView>(call(base, { headers }));
    expect(v2.locations).toEqual([]);
  });

  it('rejects non-admin members, guests, and invalid mapUrl schemes', async () => {
    const g = await guestHeaders(PID.C);
    const guestRes = await call(`${base}/locations`, {
      method: 'POST',
      headers: { ...g, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sân A', address: '123 HN' }),
    });
    expect(guestRes.status).toBe(403);

    // Link An as a non-admin member
    const anSid = await linkMember(PID.A, U.an, 'An');
    const anRes = await call(`${base}/locations`, {
      method: 'POST',
      headers: { Cookie: `sid=${anSid}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sân A', address: '123 HN' }),
    });
    expect(anRes.status).toBe(403);

    const headers = await minh();
    const badUrlRes = await call(`${base}/locations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sân A', address: '123 HN', mapUrl: 'javascript:alert(1)' }),
    });
    expect(badUrlRes.status).toBe(422);
  });

  it('validates required fields, length limits, and returns 404 for missing locations', async () => {
    const headers = await minh();

    // Missing name
    const resNoName = await call(`${base}/locations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ', address: '123 HN' }),
    });
    expect(resNoName.status).toBe(422);

    // Name too long (> 120)
    const resLongName = await call(`${base}/locations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'A'.repeat(121), address: '123 HN' }),
    });
    expect(resLongName.status).toBe(422);

    // Missing address
    const resNoAddr = await call(`${base}/locations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sân A', address: '   ' }),
    });
    expect(resNoAddr.status).toBe(422);

    // Address too long (> 200)
    const resLongAddr = await call(`${base}/locations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sân A', address: 'B'.repeat(201) }),
    });
    expect(resLongAddr.status).toBe(422);

    // Phone too long (> 30)
    const resLongPhone = await call(`${base}/locations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sân A', address: '123 HN', phone: '0'.repeat(31) }),
    });
    expect(resLongPhone.status).toBe(422);

    // Notes too long (> 200)
    const resLongNotes = await call(`${base}/locations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sân A', address: '123 HN', notes: 'C'.repeat(201) }),
    });
    expect(resLongNotes.status).toBe(422);

    // Non-existent location PATCH -> 404
    const resMissingPatch = await call(`${base}/locations/non-existent-id`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sân A', address: '123 HN' }),
    });
    expect(resMissingPatch.status).toBe(404);

    // Non-existent location DELETE -> 404
    const resMissingDelete = await call(`${base}/locations/non-existent-id`, {
      method: 'DELETE',
      headers,
    });
    expect(resMissingDelete.status).toBe(404);
  });

  it('reflects aiBookingExtract true when GEMINI_API_KEY is configured and actor is admin', async () => {
    const origKey = (env as Record<string, unknown>).GEMINI_API_KEY;
    try {
      (env as Record<string, unknown>).GEMINI_API_KEY = 'test-gemini-key';
      const headers = await minh();
      const v = await json<TripView>(call(base, { headers }));
      expect(v.aiBookingExtract).toBe(true);

      const g = await guestHeaders(PID.C);
      const gv = await json<TripView>(call(base, { headers: g }));
      expect(gv.aiBookingExtract).toBe(false);
    } finally {
      if (origKey !== undefined) {
        (env as Record<string, unknown>).GEMINI_API_KEY = origKey;
      } else {
        delete (env as Record<string, unknown>).GEMINI_API_KEY;
      }
    }
  });
});
