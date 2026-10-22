import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { PayInfo, TripView } from '@fsl/core';
import { call, json, seedTrip, seedExpenses, memberSid, guestHeaders, linkMember, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const send = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const view = (headers: Record<string, string>) => json<TripView>(call(base, { headers }));

beforeEach(async () => {
  await seedTrip();
  await seedExpenses();
});

describe('paying someone who left', () => {
  it('the receiver opens the QR for a payer who left', async () => {
    await send('DELETE', `/people/${PID.C}`, await minh());
    const res = await call(`${base}/pay/${PID.M}?from=${PID.C}`, { headers: await minh() });
    expect(res.status).toBe(200);
    expect((await json<PayInfo>(res)).amount).toBe(1245000);
  });

  it('someone who owes a person who left still opens their pay screen', async () => {
    // Bình pays a big bill so the others owe him, has approved bank details, then is removed.
    const bill = { description: 'Xe đưa đón', amount: 3000000, spentOn: '2026-10-11', payerId: PID.B, mode: 'equal', entries: [PID.M, PID.B].map((participantId) => ({ participantId, value: 1 })) };
    expect((await send('POST', '/expenses', await minh(), bill)).status).toBe(201);
    await env.DB.prepare("INSERT INTO bank_details (id, participant_id, bin, account_number, holder_name, status, consent_at, created_at) VALUES ('b-binh', ?, '970407', '0123456789', 'BINH', 'approved', '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z')").bind(PID.B).run();
    await send('DELETE', `/people/${PID.B}`, await minh());
    const debt = (await view(await minh())).suggestions.find((s) => s.toId === PID.B && s.fromId !== PID.M);
    expect(debt).toBeDefined();
    const res = await call(`${base}/pay/${PID.B}`, { headers: await guestHeaders(debt!.fromId) });
    expect(res.status).toBe(200);
    expect((await json<PayInfo>(res)).bankState).toBe('ok');
  });
});

describe('one name per user, after bringing someone back', () => {
  it('bringing back a member who already holds another name is refused', async () => {
    const anSid = await linkMember(PID.A, U.an, 'An');
    await send('DELETE', `/people/${PID.A}`, await minh());
    // While away, the same account claims guest Chi and an admin approves it.
    const g = await guestHeaders(PID.C);
    const asAn = { ...g, Cookie: `${g.Cookie}; sid=${anSid}` };
    const { requestId } = await json<{ requestId: string }>(send('POST', '/membership', asAn, { participantId: PID.C }));
    expect((await send('POST', `/membership/${requestId}/approve`, await minh())).status).toBe(204);
    const res = await send('POST', `/people/${PID.A}/restore`, await minh());
    expect(res.status).toBe(409);
    const active = await env.DB.prepare("SELECT id FROM participants WHERE user_id = ? AND status = 'active'").bind(U.an).all<{ id: string }>();
    expect(active.results).toEqual([{ id: PID.C }]);
  });
});

describe('a waiting payment to someone who leaves', () => {
  it('counts once the receiver is gone, since nobody else can confirm it', async () => {
    await linkMember(PID.B, 'u-binh', 'Bình');
    const paid = await send('POST', '/payments', await guestHeaders(PID.C), { fromId: PID.C, toId: PID.B, amount: 100000 });
    const { paymentId, status } = await json<{ paymentId: string; status: string }>(paid);
    expect(status).toBe('says_paid');
    await send('DELETE', `/people/${PID.B}`, await minh());
    const payment = (await view(await minh())).payments.find((p) => p.id === paymentId);
    expect(payment).toMatchObject({ status: 'confirmed', amountConfirmed: 100000 });
  });
});
