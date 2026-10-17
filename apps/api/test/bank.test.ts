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

  it('a guest can replace their details while they wait', async () => {
    const chi = await guestHeaders(PID.C);
    await send('PUT', `${base}/bank`, chi, chiBank);
    expect((await send('PUT', `${base}/bank`, chi, { ...chiBank, accountNumber: '9999999999' })).status).toBe(204);
    const banks = (await view(await minh())).approvals.filter((a) => a.kind === 'bank');
    expect(banks).toEqual([expect.objectContaining({ participantId: PID.C, accountNumber: '9999999999' })]);
  });

  it('once approved, only a member can change them', async () => {
    const chi = await guestHeaders(PID.C);
    await send('PUT', `${base}/bank`, chi, chiBank);
    await approveChiBank();
    expect((await send('PUT', `${base}/bank`, chi, { ...chiBank, accountNumber: '9999999999' })).status).toBe(403);
    const info = await json<PayInfo>(pay(await guestHeaders(PID.A), PID.C));
    expect(info.bank?.accountNumber).toBe('0123456789');
    expect((await view(await minh())).approvals.filter((a) => a.kind === 'bank')).toHaveLength(0);
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

describe('members manage a guest\'s bank details', () => {
  const guestBank = (pid: string) => `${base}/people/${pid}/bank`;
  const chiPerson = async (headers: Record<string, string>) => (await view(headers)).people.find((p) => p.id === PID.C);

  it('a member saves them and they count straight away', async () => {
    expect((await send('PUT', guestBank(PID.C), await minh(), chiBank)).status).toBe(204);
    const info = await json<PayInfo>(pay(await guestHeaders(PID.A), PID.C));
    expect(info).toMatchObject({ bankState: 'ok', bank: { accountNumber: '0123456789', holderName: 'TRAN THI CHI' } });
    const headers = await minh();
    expect(await chiPerson(headers)).toMatchObject({ bank: 'approved' });
    expect((await view(headers)).approvals.filter((a) => a.kind === 'bank')).toHaveLength(0);
  });

  it('a member\'s save replaces both a waiting and an approved account', async () => {
    const chi = await guestHeaders(PID.C);
    await send('PUT', `${base}/bank`, chi, chiBank);
    await approveChiBank();
    await env.DB.prepare("INSERT INTO bank_details (id, participant_id, bin, account_number, holder_name, status, consent_at, created_at) VALUES ('b-old-pending', ?, '970422', '5555555555', 'TRAN THI CHI', 'pending', ?, ?)")
      .bind(PID.C, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z').run();
    await send('PUT', guestBank(PID.C), await minh(), { ...chiBank, accountNumber: '7777777777' });
    const live = await env.DB.prepare("SELECT account_number FROM bank_details WHERE participant_id = ? AND status IN ('approved', 'pending')").bind(PID.C).all<{ account_number: string }>();
    expect(live.results).toEqual([{ account_number: '7777777777' }]);
  });

  it('a member deletes them, and the guest\'s next details wait for approval again', async () => {
    await send('PUT', guestBank(PID.C), await minh(), chiBank);
    expect((await send('DELETE', guestBank(PID.C), await minh())).status).toBe(204);
    expect(await chiPerson(await minh())).toMatchObject({ bank: 'none' });
    expect((await json<PayInfo>(pay(await guestHeaders(PID.A), PID.C))).bankState).toBe('none');
    expect((await send('PUT', `${base}/bank`, await guestHeaders(PID.C), chiBank)).status).toBe(204);
    expect(await chiPerson(await minh())).toMatchObject({ bank: 'pending' });
  });

  it('logs who saved and who deleted them', async () => {
    await send('PUT', guestBank(PID.C), await minh(), chiBank);
    await send('DELETE', guestBank(PID.C), await minh());
    const rows = await env.DB.prepare("SELECT action, details_json FROM activity WHERE trip_id = ? AND action IN ('bank_set', 'bank_removed') ORDER BY created_at").bind(T.tripId).all<{ action: string; details_json: string }>();
    expect(rows.results.map((r) => [r.action, JSON.parse(r.details_json)])).toEqual([
      ['bank_set', { participantId: PID.C }],
      ['bank_removed', { participantId: PID.C }],
    ]);
  });

  it('only members may, only for guests of this trip, and only with consent', async () => {
    const headers = await minh();
    expect((await send('PUT', guestBank(PID.C), await guestHeaders(PID.A), chiBank)).status).toBe(403);
    expect((await send('DELETE', guestBank(PID.C), await guestHeaders(PID.A))).status).toBe(403);
    expect((await send('PUT', guestBank(PID.M), headers, chiBank)).status).toBe(403);
    expect((await send('PUT', guestBank('p-nobody'), headers, chiBank)).status).toBe(404);
    expect((await send('PUT', guestBank(PID.C), headers, { ...chiBank, consent: false })).status).toBe(422);
    expect((await send('DELETE', guestBank(PID.C), headers)).status).toBe(404);
  });

  it('an archived trip refuses both', async () => {
    await env.DB.prepare("UPDATE trips SET archived_at = '2026-10-13T00:00:00.000Z' WHERE id = ?").bind(T.tripId).run();
    expect((await send('PUT', guestBank(PID.C), await minh(), chiBank)).status).toBe(409);
    expect((await send('DELETE', guestBank(PID.C), await minh())).status).toBe(409);
  });
});

describe('masked bank account in the trip view', () => {
  const chiAccount = { bankName: findBank('970422')!.shortName, accountNumberMasked: '0123 •••• 6789', holderName: 'TRAN THI CHI' };

  it('members see every guest\'s account and a guest sees only their own', async () => {
    const chi = await guestHeaders(PID.C);
    await send('PUT', `${base}/bank`, chi, chiBank);
    const of = async (headers: Record<string, string>) => (await view(headers)).people.find((p) => p.id === PID.C)?.bankAccount;
    expect(await of(await minh())).toEqual(chiAccount);
    expect(await of(chi)).toEqual(chiAccount);
    expect(await of(await guestHeaders(PID.A))).toBeUndefined();
    expect(await of(await guestHeaders(undefined, T.viewToken))).toBeUndefined();
  });

  it('a member\'s own account is never in it', async () => {
    expect((await view(await minh())).people.find((p) => p.id === PID.M)?.bankAccount).toBeUndefined();
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

  it('Review Focus 4: ?bill=1 returns static VietQR for expense payer (including self) while preserving non-bill behavior', async () => {
    // Minh is the payer of e-1 and has approved bank details
    const selfBill = await json<PayInfo>(call(`${base}/pay/${PID.M}?bill=1`, { headers: await minh() }));
    expect(selfBill.bankState).toBe('ok');
    expect(selfBill.payload).toBe(
      buildVietQrPayload({ bin: '970407', accountNumber: '19031234565678', amount: 0, note: 'DA LAT OCT 2026' }),
    );

    // Guest B does not owe Chi (because of fewestTransfers), but Chi is the payer of e-c, so ?bill=1 works for B
    await send('PUT', `${base}/bank`, await guestHeaders(PID.C), chiBank);
    await approveChiBank();
    const guestBill = await json<PayInfo>(call(`${base}/pay/${PID.C}?bill=1`, { headers: await guestHeaders(PID.B) }));
    expect(guestBill.bankState).toBe('ok');
    expect(guestBill.payload?.startsWith('000201010211')).toBe(true);

    // View-only token is still forbidden from ?bill=1
    expect((await call(`${base}/pay/${PID.M}?bill=1`, { headers: await guestHeaders(undefined, T.viewToken) })).status).toBe(403);
  });
});

describe('pay info for the receiver', () => {
  const payFrom = (headers: Record<string, string>, toId: string, fromId: string) => call(`${base}/pay/${toId}?from=${fromId}`, { headers });

  // Without Chi's 3.000.000 expense Chi owes Minh her 1.245.000 share of the first four expenses.
  async function chiOwesMinh() {
    await env.DB.prepare("DELETE FROM expense_shares WHERE expense_id = 'e-c'").run();
    await env.DB.prepare("DELETE FROM expenses WHERE id = 'e-c'").run();
  }

  it('the receiver gets their own QR for a payer with the same note the payer sees', async () => {
    await chiOwesMinh();
    const forMinh = await json<PayInfo>(payFrom(await minh(), PID.M, PID.C));
    const forChi = await json<PayInfo>(pay(await guestHeaders(PID.C), PID.M));
    expect(forMinh).toMatchObject({ to: { id: PID.M, name: 'Minh' }, amount: 1245000, bankState: 'ok', bank: { accountNumberMasked: '1903 •••• 5678' } });
    expect(forMinh.refCode).toMatch(/^DALAT [2-9A-HJ-NP-Z]{4}$/);
    expect(forMinh.refCode).toBe(forChi.refCode);
    expect(forMinh.payload).toBe(buildVietQrPayload({ bin: '970407', accountNumber: '19031234565678', amount: 1245000, note: forMinh.refCode }));
  });

  it('only the receiver may ask for a payer\'s QR', async () => {
    await chiOwesMinh(); // so Chi's own pay screen for Minh would otherwise answer 200
    expect((await payFrom(await guestHeaders(PID.C), PID.M, PID.B)).status).toBe(403);
    expect((await payFrom(await guestHeaders(undefined, T.viewToken), PID.M, PID.B)).status).toBe(403);
  });

  it('nothing owed: amount 0 and no payload', async () => {
    // Chi is owed money in this trip, so she owes Minh nothing.
    const info = await json<PayInfo>(payFrom(await minh(), PID.M, PID.C));
    expect(info).toMatchObject({ to: { id: PID.M }, amount: 0, bankState: 'ok', payload: null, inFlight: [] });
    expect(info.refCode).toMatch(/^DALAT [2-9A-HJ-NP-Z]{4}$/);
  });

  it('a payer who is not in the trip is not found', async () => {
    expect((await payFrom(await minh(), PID.M, 'p-nobody')).status).toBe(404);
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
