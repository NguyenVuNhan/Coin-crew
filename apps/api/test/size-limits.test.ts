import { describe, it, expect, beforeEach } from 'vitest';
import type { TripListItem, TripView } from '@fsl/core';
import { call, json, seedTrip, seedManyExpenses, memberSid, U, T, PID } from './helpers';

const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });

beforeEach(async () => { await seedTrip(); await seedManyExpenses(150); });

describe('trips with more than 100 expenses (D1 allows 100 bound parameters per query)', () => {
  it('the trip still opens', async () => {
    const res = await call(`/api/trips/${T.tripId}`, { headers: await minh() });
    expect(res.status).toBe(200);
    const v = await json<TripView>(res);
    expect(v.expenses).toHaveLength(150);
    expect(v.balances[PID.B]).toBe(-75000);
  });

  it('My trips still loads', async () => {
    const list = await json<TripListItem[]>(call('/api/trips', { headers: await minh() }));
    expect(list.find((t) => t.id === T.tripId)?.myBalance).toBe(75000);
  });

  it('merging still works', async () => {
    const headers = { ...(await minh()), 'Content-Type': 'application/json' };
    const res = await call(`/api/trips/${T.tripId}/people/merge`, { method: 'POST', headers, body: JSON.stringify({ fromId: PID.B, intoId: PID.A }) });
    expect(res.status).toBe(204);
    const v = await json<TripView>(call(`/api/trips/${T.tripId}`, { headers }));
    expect(v.balances[PID.A]).toBe(-75000);
  });
});
