import { beforeEach, describe, expect, it } from 'vitest';
import type { TripView } from '@cc/core';
import { call, json, linkMember, memberSid, PID, seedTrip, T, U } from './helpers';

describe('PATCH /api/trips/:id theme guards', () => {
  let minh: Record<string, string>;

  const view = (headers: Record<string, string>, tripId: string = T.tripId) =>
    json<TripView>(call(`/api/trips/${tripId}`, { headers }));
  const patchTrip = (headers: Record<string, string>, body: unknown, tripId: string = T.tripId) =>
    call(`/api/trips/${tripId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeEach(async () => {
    await seedTrip();
    minh = { Cookie: `sid=${await memberSid(U.minh, 'Minh')}` };
    await linkMember(PID.A, U.an, 'An');
  });

  it('the personal ledger refuses group colours', async () => {
    const ledgerRes = await call('/api/me/ledger', { headers: minh });
    expect(ledgerRes.status).toBe(200);
    const ledger = await json<{ tripId: string; ownerPid: string }>(ledgerRes);

    const res = await patchTrip(minh, { theme: 'sky' }, ledger.tripId);
    expect(res.status).toBe(422);
    const err = await json<{ error: { code: string; message: string } }>(res);
    expect(err.error.message).toBe('Group colours are only for groups.');

    expect((await view(minh, ledger.tripId)).trip.theme).toBeNull();
  });

  it('theme must come alone', async () => {
    for (const body of [
      { theme: 'sky', fewestTransfers: true },
      { theme: 'sky', roundTransfers: false },
      { theme: 'sky', ratingsEnabled: true },
      { theme: null, fewestTransfers: false },
    ]) {
      const res = await patchTrip(minh, body);
      expect(res.status).toBe(422);
      const err = await json<{ error: { code: string; message: string } }>(res);
      expect(err.error.message).toBe('Invalid request');
    }

    expect((await view(minh)).trip.theme).toBeNull();
  });
});
