import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import type { TripView } from '@fsl/core';
import { call, guestHeaders, json, linkMember, memberSid, PID, seedExpenses, seedTrip, T, U } from './helpers';
import { bumpVersion, makeSport } from './fund-helpers';

let minh: Record<string, string>;
let an: Record<string, string>;
const view = (headers: Record<string, string>) => json<TripView>(call(`/api/trips/${T.tripId}`, { headers }));

async function sql(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

beforeEach(async () => {
  await seedTrip();
  await seedExpenses();
  minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
  an = { Cookie: `sid=${await linkMember(PID.A, U.an, 'An')}` };
});

describe('player ratings in snapshot and trip view', () => {
  it('returns ratings: null for a non-sport trip group', async () => {
    const v = await view(minh);
    expect(v.ratings).toBeNull();
  });

  it('returns default disabled ratings for a sport group with maxStars = 2 * activeCount', async () => {
    await makeSport();
    const v = await view(minh);
    expect(v.ratings).toEqual({
      enabled: false,
      totalStars: { [PID.M]: 0, [PID.A]: 0, [PID.B]: 0, [PID.C]: 0 },
      maxStars: 8,
      myAllocations: {},
    });
  });

  it('aggregates totalStars publicly while isolating myAllocations strictly to the caller', async () => {
    await makeSport();
    await sql('UPDATE trips SET ratings_enabled = 1 WHERE id = ?', T.tripId);
    await sql(
      "INSERT INTO player_ratings (trip_id, rater_participant_id, target_participant_id, stars, updated_at) VALUES (?, ?, ?, 4, '2026-10-26T00:00:00.000Z'), (?, ?, ?, 3, '2026-10-26T00:00:00.000Z'), (?, ?, ?, 2, '2026-10-26T00:00:00.000Z')",
      T.tripId, PID.M, PID.B,
      T.tripId, PID.A, PID.B,
      T.tripId, PID.A, PID.C,
    );
    await bumpVersion();

    const minhView = await view(minh);
    expect(minhView.ratings).toEqual({
      enabled: true,
      totalStars: { [PID.M]: 0, [PID.A]: 0, [PID.B]: 7, [PID.C]: 2 },
      maxStars: 8,
      myAllocations: { [PID.B]: 4 },
    });

    const anView = await view(an);
    expect(anView.ratings).toEqual({
      enabled: true,
      totalStars: { [PID.M]: 0, [PID.A]: 0, [PID.B]: 7, [PID.C]: 2 },
      maxStars: 8,
      myAllocations: { [PID.B]: 3, [PID.C]: 2 },
    });

    const guestView = await view(await guestHeaders(PID.B));
    expect(guestView.ratings).toEqual({
      enabled: true,
      totalStars: { [PID.M]: 0, [PID.A]: 0, [PID.B]: 7, [PID.C]: 2 },
      maxStars: 8,
      myAllocations: {},
    });
  });

  it('rebuilds a cached snapshot that was stored before ratings existed', async () => {
    await makeSport();
    await view(minh);
    const row = await env.DB.prepare('SELECT json FROM trip_views WHERE trip_id = ?').bind(T.tripId).first<{ json: string }>();
    const legacy = JSON.parse(row!.json) as Record<string, unknown>;
    delete legacy.ratings;
    await sql('UPDATE trip_views SET json = ? WHERE trip_id = ?', JSON.stringify(legacy), T.tripId);

    const rebuilt = await view(minh);
    expect(rebuilt.ratings).not.toBeUndefined();
    expect(rebuilt.ratings?.maxStars).toBe(8);
  });
});
