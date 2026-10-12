import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { buildVietQrPayload, findBank, type PayInfo, type TripView } from '@fsl/core';
import { call, json, seedTrip, seedExpenses, seedMinhBank, memberSid, guestHeaders, T, U, PID } from './helpers';

const base = `/api/trips/${T.tripId}`;
const send = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  call(path, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });
const view = (headers: Record<string, string>) => json<TripView>(call(base, { headers }));
const pay = (headers: Record<string, string>, toId: string) => call(`${base}/pay/${toId}`, { headers });
const chiBank = { bin: '970422', accountNumber: '0123456789', holderName: 'Trần Thị Chi', consent: true };

// Chi paid 3.000.000 for An and Bình, so with fewest transfers An owes Chi 1.755.000 and Bình owes Minh.
async function seedChiIsOwed() {
  await env.DB.prepare("INSERT INTO expenses (id, trip_id, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES ('e-c', ?, 'Vé cáp treo', 3000000, 'VND', '2026-10-11', ?, 'equal', 'approved', ?, '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z')")
    .bind(T.tripId, PID.C, PID.M).run();
  await env.DB.prepare("INSERT INTO expense_shares (expense_id, participant_id, input_value, amount) VALUES ('e-c', ?, 1, 1500000), ('e-c', ?, 1, 1500000)").bind(PID.A, PID.B).run();
}

async function approveChiBank() {
  const headers = await minh();
  const approval = (await view(headers)).approvals.find((a) => a.kind === 'bank') as { bankId: string } | undefined;
  return send('POST', `${base}/bank/${approval!.bankId}/approve`, headers);
}

beforeEach(async () => { await seedTrip(); await seedExpenses(); await seedChiIsOwed(); await seedMinhBank(); });

describe('guest bank details', () => {
  it('wait for approval; until then no QR', async () => {
    expect((await send('PUT', `${base}/bank`, await guestHeaders(PID.C), chiBank)).status).toBe(204);
    const info = await json<PayInfo>(pay(await guestHeaders(PID.A), PID.C));
    expect(info).toMatchObject({ to: { id: PID.C, name: 'Chi' }, amount: 1755000, bankState: 'pending', bank: null, payload: null });
    expect((await view(await minh())).people.find((p) => p.id === PID.C)?.bank).toBe('pending');
  });

  it('after approval the payer gets the VietQR payload with the pair note', async () => {
    await send('PUT', `${base}/bank`, await guestHeaders(PID.C), chiBank);
    expect((await approveChiBank()).status).toBe(204);
    const info = await json<PayInfo>(pay(await guestHeaders(PID.A), PID.C));
    expect(info.bankState).toBe('ok');
    expect(info.bank).toEqual({ bin: '970422', bankName: findBank('970422')!.shortName, accountNumber: '0123456789', accountNumberMasked: '0123 •••• 6789', holderName: 'TRAN THI CHI' });
    expect(info.refCode).toMatch(/^DALAT [2-9A-HJ-NP-Z]{4}$/);
    expect(info.payload).toBe(buildVietQrPayload({ bin: '970422', accountNumber: '0123456789', amount: 1755000, note: info.refCode }));
  });

  it('a change waits for approval and the approved account stays in use', async () => {
    const chi = await guestHeaders(PID.C);
    await send('PUT', `${base}/bank`, chi, chiBank);
    await approveChiBank();
    await send('PUT', `${base}/bank`, chi, { ...chiBank, accountNumber: '9999999999' });
    const info = await json<PayInfo>(pay(await guestHeaders(PID.A), PID.C));
    expect(info.bank?.accountNumber).toBe('0123456789');
    expect((await view(await minh())).approvals.filter((a) => a.kind === 'bank')).toHaveLength(1);
  });

  it('approving twice is ALREADY_HANDLED', async () => {
    await send('PUT', `${base}/bank`, await guestHeaders(PID.C), chiBank);
    const headers = await minh();
    const { bankId } = (await view(headers)).approvals.find((a) => a.kind === 'bank') as { bankId: string };
    expect((await send('POST', `${base}/bank/${bankId}/approve`, headers)).status).toBe(204);
    expect((await send('POST', `${base}/bank/${bankId}/approve`, headers)).status).toBe(409);
  });

  it('rejects unknown banks, missing consent and pending names', async () => {
    const chi = await guestHeaders(PID.C);
    expect((await send('PUT', `${base}/bank`, chi, { ...chiBank, bin: '000000' })).status).toBe(422);
    expect((await send('PUT', `${base}/bank`, chi, { ...chiBank, consent: false })).status).toBe(422);
    expect((await send('PUT', `${base}/bank`, chi, { ...chiBank, accountNumber: '12ab' })).status).toBe(422);
    const g = await guestHeaders();
    await send('POST', `${base}/people`, g, { name: 'Dũng', confirmNew: true });
    expect((await send('PUT', `${base}/bank`, g, chiBank)).status).toBe(403);
  });
});

describe('pay info', () => {
  it('only someone who owes the person sees their bank details', async () => {
    await send('PUT', `${base}/bank`, await guestHeaders(PID.C), chiBank);
    await approveChiBank();
    expect((await pay(await guestHeaders(PID.B), PID.C)).status).toBe(403);
    expect((await pay(await guestHeaders(undefined, T.viewToken), PID.C)).status).toBe(403);
  });

  it('the transfer note is stable per pair and differs between payers', async () => {
    const a1 = await json<PayInfo>(pay(await guestHeaders(PID.A), PID.M));
    const a2 = await json<PayInfo>(pay(await guestHeaders(PID.A), PID.M));
    const b = await json<PayInfo>(pay(await guestHeaders(PID.B), PID.M));
    expect(a1.refCode).toBe(a2.refCode);
    expect(b.refCode).not.toBe(a1.refCode);
    expect(b).toMatchObject({ amount: 2065000, bankState: 'ok', bank: { accountNumberMasked: '1903 •••• 5678', holderName: 'NGUYEN VAN MINH' } });
  });

  it('you can see your own details without a QR', async () => {
    const info = await json<PayInfo>(pay(await minh(), PID.M));
    expect(info).toMatchObject({ amount: 0, bankState: 'ok', refCode: '', payload: null });
  });
});

describe('member bank details', () => {
  it('count straight away and refresh the trip view', async () => {
    await env.DB.prepare("DELETE FROM bank_details WHERE user_id = ?").bind(U.minh).run();
    const headers = await minh();
    expect((await view(headers)).people[0]?.bank).toBe('none');
    expect((await send('PUT', '/api/me/bank', headers, { bin: '970407', accountNumber: '19031234565678', holderName: 'Nguyễn Văn Minh', consent: true })).status).toBe(204);
    expect((await view(headers)).people[0]?.bank).toBe('approved');
    const row = await env.DB.prepare("SELECT holder_name, status FROM bank_details WHERE user_id = ?").bind(U.minh).first<{ holder_name: string; status: string }>();
    expect(row).toEqual({ holder_name: 'NGUYEN VAN MINH', status: 'approved' });
  });
});
