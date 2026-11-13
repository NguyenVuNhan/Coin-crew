import { describe, it, expect, beforeEach } from 'vitest';
import type { TripView } from '@cc/core';
import { call, json, seedTrip, linkMember, guestHeaders, T, U, PID } from './helpers';

const view = (headers: Record<string, string>) => json<TripView>(call(`/api/trips/${T.tripId}`, { headers }));

describe('a guest pick of a name that now belongs to an account', () => {
  beforeEach(async () => { await seedTrip(); });

  it('acts as that name while the name has no account', async () => {
    const v = await view(await guestHeaders(PID.A));
    expect(v.me).toMatchObject({ kind: 'guest', participantId: PID.A });
  });

  it('no longer acts as that person once someone signs in as them', async () => {
    const headers = await guestHeaders(PID.A);
    await linkMember(PID.A, U.an, 'An');
    const v = await view(headers);
    expect(v.me).toMatchObject({ kind: 'guest', participantId: null });

    const res = await call(`/api/trips/${T.tripId}/expenses`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Cà phê', amount: 100000, payerId: PID.A, mode: 'equal', shares: [{ participantId: PID.A }, { participantId: PID.B }] }),
    });
    expect(res.status).not.toBe(201);
  });

  it('still acts as them on a phone signed in as that account', async () => {
    const sid = await linkMember(PID.A, U.an, 'An');
    const v = await view({ Cookie: `sid=${sid}` });
    expect(v.me).toMatchObject({ kind: 'member', participantId: PID.A });
  });
});
