import { beforeEach, describe, expect, it } from 'vitest';
import type { ActivityItem, TripView } from '@fsl/core';
import { call, guestHeaders, json, linkMember, memberSid, PID, seedExpenses, seedTrip, T, U } from './helpers';
import { archive, makeSport } from './fund-helpers';

let minh: Record<string, string>;
let an: Record<string, string>;

const view = (headers: Record<string, string>) => json<TripView>(call(`/api/trips/${T.tripId}`, { headers }));
const patchTrip = (headers: Record<string, string>, body: unknown) =>
  call(`/api/trips/${T.tripId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const rate = (headers: Record<string, string>, body: unknown) =>
  call(`/api/trips/${T.tripId}/ratings`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  await seedTrip();
  await seedExpenses();
  minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
  an = { Cookie: `sid=${await linkMember(PID.A, U.an, 'An')}` };
});

describe('PATCH /trips/:id ratingsEnabled toggle', () => {
  it('allows an admin in a sport group to enable and disable player ratings and logs ratings_changed', async () => {
    await makeSport();
    const res1 = await patchTrip(minh, { ratingsEnabled: true });
    expect(res1.status).toBe(204);
    expect((await view(minh)).ratings?.enabled).toBe(true);

    const res2 = await patchTrip(minh, { ratingsEnabled: false });
    expect(res2.status).toBe(204);
    expect((await view(minh)).ratings?.enabled).toBe(false);

    const acts = await json<ActivityItem[]>(call(`/api/trips/${T.tripId}/activity`, { headers: minh }));
    expect(acts[0]).toMatchObject({ action: 'ratings_changed', details: { ratingsEnabled: false } });
    expect(acts[1]).toMatchObject({ action: 'ratings_changed', details: { ratingsEnabled: true } });
  });

  it('refuses ratingsEnabled toggle for non-admins and non-sport groups', async () => {
    expect((await patchTrip(minh, { ratingsEnabled: true })).status).toBe(403);

    await makeSport();
    expect((await patchTrip(an, { ratingsEnabled: true })).status).toBe(403);
  });
});

describe('POST /trips/:id/ratings star allocation, anonymity, and guards', () => {
  beforeEach(async () => {
    await makeSport();
    await patchTrip(minh, { ratingsEnabled: true });
  });

  it('allocates and reclaims stars, enforcing strict anonymity and zero activity log leakage', async () => {
    expect((await rate(an, { targetParticipantId: PID.B, delta: 1 })).status).toBe(200);
    expect((await rate(an, { targetParticipantId: PID.B, delta: 1 })).status).toBe(200);
    expect((await rate(an, { targetParticipantId: PID.M, delta: 1 })).status).toBe(200);

    const anView = await view(an);
    expect(anView.ratings).toEqual({
      enabled: true,
      totalStars: { [PID.M]: 1, [PID.A]: 0, [PID.B]: 2, [PID.C]: 0 },
      maxStars: 8,
      myAllocations: { [PID.B]: 2, [PID.M]: 1 },
    });

    const minhView = await view(minh);
    expect(minhView.ratings).toEqual({
      enabled: true,
      totalStars: { [PID.M]: 1, [PID.A]: 0, [PID.B]: 2, [PID.C]: 0 },
      maxStars: 8,
      myAllocations: {},
    });

    const acts = await json<ActivityItem[]>(call(`/api/trips/${T.tripId}/activity`, { headers: minh }));
    expect(acts.map((a) => a.action)).toEqual(['ratings_changed']);

    const reclaimRes = await rate(an, { targetParticipantId: PID.M, delta: -1 });
    expect(reclaimRes.status).toBe(200);
    expect(await json(reclaimRes)).toEqual({ stars: 0, spentStars: 2, maxStars: 8 });
    expect((await view(an)).ratings?.myAllocations).toEqual({ [PID.B]: 2 });
  });

  it('supports atomic star setting and resetting to 0 without activity log leakage', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await rate(an, { targetParticipantId: PID.B, delta: 1 })).status).toBe(200);
    }
    expect((await rate(an, { targetParticipantId: PID.M, delta: 1 })).status).toBe(200);

    const resetRes = await rate(an, { targetParticipantId: PID.B, stars: 0 });
    expect(resetRes.status).toBe(200);
    expect(await json(resetRes)).toEqual({ stars: 0, spentStars: 1, maxStars: 8 });
    expect((await view(an)).ratings?.myAllocations).toEqual({ [PID.M]: 1 });

    // Resetting when already at 0 is refused with 409 RATING_LIMIT
    expect((await rate(an, { targetParticipantId: PID.B, stars: 0 })).status).toBe(409);

    const acts = await json<ActivityItem[]>(call(`/api/trips/${T.tripId}/activity`, { headers: minh }));
    expect(acts.map((a) => a.action)).toEqual(['ratings_changed']);
  });

  it('enforces self-rating block (422), 5-star per-target cap (409), 2*N total budget (409), and 0-floor (409)', async () => {
    expect((await rate(an, { targetParticipantId: PID.A, delta: 1 })).status).toBe(422);
    expect((await rate(an, { targetParticipantId: PID.B, delta: -1 })).status).toBe(409);

    for (let i = 0; i < 5; i++) {
      expect((await rate(an, { targetParticipantId: PID.B, delta: 1 })).status).toBe(200);
    }
    const sixthOnBinh = await rate(an, { targetParticipantId: PID.B, delta: 1 });
    expect(sixthOnBinh.status).toBe(409);
    expect((await json<{ error: { code: string } }>(sixthOnBinh)).error.code).toBe('RATING_LIMIT');

    for (let i = 0; i < 3; i++) {
      expect((await rate(an, { targetParticipantId: PID.C, delta: 1 })).status).toBe(200);
    }
    const ninthTotal = await rate(an, { targetParticipantId: PID.M, delta: 1 });
    expect(ninthTotal.status).toBe(409);
    expect((await json<{ error: { code: string } }>(ninthTotal)).error.code).toBe('RATING_LIMIT');
  });

  it('refuses guests, viewers, disabled ratings, and archived trips', async () => {
    const guest = await guestHeaders(PID.B);
    expect((await rate(guest, { targetParticipantId: PID.M, delta: 1 })).status).toBe(403);

    const viewer = { 'X-Link-Token': T.viewToken };
    expect((await rate(viewer, { targetParticipantId: PID.M, delta: 1 })).status).toBe(403);

    await patchTrip(minh, { ratingsEnabled: false });
    expect((await rate(an, { targetParticipantId: PID.B, delta: 1 })).status).toBe(403);

    await patchTrip(minh, { ratingsEnabled: true });
    await archive();
    expect((await rate(an, { targetParticipantId: PID.B, delta: 1 })).status).toBe(409);
  });

  it('roster shrink refunds stars on the removed player and soft-freezes over-budget members until they reclaim', async () => {
    for (let i = 0; i < 5; i++) await rate(an, { targetParticipantId: PID.M, delta: 1 });
    for (let i = 0; i < 3; i++) await rate(an, { targetParticipantId: PID.B, delta: 1 });

    for (let i = 0; i < 2; i++) await rate(minh, { targetParticipantId: PID.C, delta: 1 });

    const delRes = await call(`/api/trips/${T.tripId}/people/${PID.C}`, { method: 'DELETE', headers: minh });
    expect(delRes.status).toBe(204);

    const minhView = await view(minh);
    expect(minhView.ratings?.maxStars).toBe(6);
    expect(minhView.ratings?.myAllocations).toEqual({});

    const anView = await view(an);
    expect(anView.ratings?.maxStars).toBe(6);
    expect(anView.ratings?.myAllocations).toEqual({ [PID.M]: 5, [PID.B]: 3 });

    expect((await rate(an, { targetParticipantId: PID.B, delta: 1 })).status).toBe(409);

    // An resets Minh's 5 stars directly to 0 (8 -> 3 spent, now < 6 maxStars), and can then give 1 star to Bình!
    expect((await rate(an, { targetParticipantId: PID.M, stars: 0 })).status).toBe(200);
    expect((await rate(an, { targetParticipantId: PID.B, delta: 1 })).status).toBe(200);
  });
});
