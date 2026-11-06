import { beforeEach, describe, expect, it } from 'vitest';
import type { ActivityItem, MeResponse, MeUserView, TripView } from '@cc/core';
import { call, guestHeaders, json, linkMember, memberSid, PID, seedTrip, T, U } from './helpers';
import { archive, makeAdmin } from './fund-helpers';

describe('PATCH /api/me theme', () => {
  it('PATCH /api/me saves a theme and /api/me returns it', async () => {
    const sid = await memberSid('u-theme-save', 'Minh');
    const headers = { Cookie: `sid=${sid}`, 'Content-Type': 'application/json' };

    const initial = await json<MeResponse>(call('/api/me', { headers: { Cookie: `sid=${sid}` } }));
    expect(initial.user?.theme).toBeNull();

    const patchRes = await call('/api/me', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ theme: 'orchid' }),
    });
    expect(patchRes.status).toBe(200);
    const patchBody = await json<{ user: MeUserView }>(patchRes);
    expect(patchBody.user.theme).toBe('orchid');

    const after = await json<MeResponse>(call('/api/me', { headers: { Cookie: `sid=${sid}` } }));
    expect(after.user?.theme).toBe('orchid');
  });

  it('null clears it', async () => {
    const sid = await memberSid('u-theme-clear', 'Minh');
    const headers = { Cookie: `sid=${sid}`, 'Content-Type': 'application/json' };

    await call('/api/me', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ theme: 'sky' }),
    });

    const clearRes = await call('/api/me', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ theme: null }),
    });
    expect(clearRes.status).toBe(200);
    const clearBody = await json<{ user: MeUserView }>(clearRes);
    expect(clearBody.user.theme).toBeNull();

    const after = await json<MeResponse>(call('/api/me', { headers: { Cookie: `sid=${sid}` } }));
    expect(after.user?.theme).toBeNull();
  });

  it('an unknown theme is a 422', async () => {
    const sid = await memberSid('u-theme-invalid', 'Minh');
    const headers = { Cookie: `sid=${sid}`, 'Content-Type': 'application/json' };

    for (const invalid of ['rose', 'Jade', '', 3]) {
      const res = await call('/api/me', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ theme: invalid }),
      });
      expect(res.status).toBe(422);
    }
  });
});

describe('PATCH /api/trips/:id theme', () => {
  let minh: Record<string, string>;
  let an: Record<string, string>;

  const view = (headers: Record<string, string>) =>
    json<TripView>(call(`/api/trips/${T.tripId}`, { headers }));
  const patchTrip = (headers: Record<string, string>, body: unknown) =>
    call(`/api/trips/${T.tripId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeEach(async () => {
    await seedTrip();
    minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    an = { Cookie: `sid=${await linkMember(PID.A, U.an, 'An')}` };
  });

  it('an admin sets the group colours and the trip view returns them', async () => {
    expect((await view(minh)).trip.theme).toBeNull();

    await makeAdmin(PID.A, true);
    const res = await patchTrip(an, { theme: 'sky' });
    expect(res.status).toBe(204);

    const v = await view(minh);
    expect(v.trip.theme).toBe('sky');
    expect(v.trip.version).toBe(1);

    const acts = await json<ActivityItem[]>(call(`/api/trips/${T.tripId}/activity`, { headers: minh }));
    expect(acts[0]).toMatchObject({
      action: 'theme_changed',
      details: { theme: 'sky' },
    });
  });

  it("null returns to each person's own theme", async () => {
    expect((await patchTrip(minh, { theme: 'indigo' })).status).toBe(204);
    expect((await view(minh)).trip.theme).toBe('indigo');

    const res = await patchTrip(minh, { theme: null });
    expect(res.status).toBe(204);
    expect((await view(minh)).trip.theme).toBeNull();

    const acts = await json<ActivityItem[]>(call(`/api/trips/${T.tripId}/activity`, { headers: minh }));
    expect(acts[0]).toMatchObject({
      action: 'theme_changed',
      details: { theme: null },
    });
  });

  it('a plain member gets 403', async () => {
    const res = await patchTrip(an, { theme: 'orchid' });
    expect(res.status).toBe(403);
  });

  it('a guest gets 403', async () => {
    const guest = await guestHeaders(PID.B);
    const res = await patchTrip(guest, { theme: 'orchid' });
    expect(res.status).toBe(403);
  });

  it('archived groups refuse a colour change', async () => {
    await archive();
    const res = await patchTrip(minh, { theme: 'orchid' });
    expect(res.status).toBe(409);
    expect((await json<{ error: { code: string } }>(res)).error.code).toBe('TRIP_ARCHIVED');
  });

  it('an unknown theme is a 422', async () => {
    for (const invalid of ['rose', 'Jade', '', 3]) {
      const res = await patchTrip(minh, { theme: invalid });
      expect(res.status).toBe(422);
    }
  });
});
