import { describe, it, expect, beforeEach } from 'vitest';
import type { ExpenseInput } from '@cc/core';
import { call, json, seedTrip, memberSid, T, U, PID } from './helpers';

// A mistake a person can make with ordinary input carries a `reason`, so the app shows its own words; the
// English `message` stays as log text. A shape mistake only a broken client makes has no reason.
const base = `/api/trips/${T.tripId}`;
const send = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  call(path, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const err = async (res: Response) => (await json<{ error: { code: string; message: string; reason?: string } }>(res)).error;
const expense = (description: string, amount: number): ExpenseInput => ({
  description, amount, spentOn: '2026-10-11', payerId: PID.M, mode: 'equal',
  entries: [{ participantId: PID.M, value: 1 }, { participantId: PID.A, value: 1 }],
});

beforeEach(async () => { await seedTrip(); });

describe('validation reasons', () => {
  it('a blank expense description says descriptionLength', async () => {
    const res = await send('POST', `${base}/expenses`, await minh(), expense('   ', 100000));
    expect(res.status).toBe(422);
    expect(await err(res)).toEqual({ code: 'VALIDATION', message: 'Description must be 1 to 80 characters', reason: 'descriptionLength' });
  });

  it('a blank profile name says nameLength', async () => {
    const res = await send('PATCH', '/api/me', await minh(), { name: '  ' });
    expect(res.status).toBe(422);
    expect((await err(res)).reason).toBe('nameLength');
  });

  it('paying yourself says payToSelf', async () => {
    const res = await send('POST', `${base}/payments`, await minh(), { fromId: PID.M, toId: PID.M, amount: 50000 });
    expect(res.status).toBe(422);
    expect((await err(res)).reason).toBe('payToSelf');
  });

  it('a shape mistake has no reason', async () => {
    const res = await send('POST', `${base}/expenses`, await minh(), { ...expense('Bánh mì', 100000), description: 42 });
    expect(res.status).toBe(422);
    expect(await err(res)).toEqual({ code: 'VALIDATION', message: 'Invalid description' });
  });
});
