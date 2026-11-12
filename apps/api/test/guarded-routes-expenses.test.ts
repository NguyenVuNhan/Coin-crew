import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import type { TripView } from '@cc/core';
import { call, json, seedTrip, seedExpenses, memberSid, guestHeaders, T, U, PID } from './helpers';
import { makeSport, seedIncome } from './fund-helpers';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const minh = async () => ({ Cookie: `sid=${await memberSid(U.minh, 'Minh')}` });

async function status(table: 'transactions' | 'bank_details', id: string) {
  const row = await env.DB.prepare(`SELECT status FROM ${table} WHERE id = ?`).bind(id).first<{ status: string }>();
  return row!.status;
}

beforeEach(async () => { await seedTrip(); await seedExpenses(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('expense, bank and fund status changes are atomic', () => {
  it('a failed batch leaves a pending expense pending on approve', async () => {
    await env.DB.prepare("INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES ('e-p', 'e-p', NULL, 1, ?, 'expense', 'Pending', 100000, 'VND', '2026-10-11', ?, 'equal', 'pending', ?, '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z')")
      .bind(T.tripId, PID.A, PID.A).run();
    const headers = await minh();
    vi.spyOn(env.DB, 'batch').mockRejectedValueOnce(new Error('boom'));

    const res = await post('/expenses/e-p/approve', headers);
    expect(res.status).toBe(500);
    expect(await status('transactions', 'e-p')).toBe('pending');
  });

  it('a failed batch leaves a pending bank detail pending on approve', async () => {
    const chi = await guestHeaders(PID.C);
    const put = await call(`${base}/bank`, {
      method: 'PUT',
      headers: { ...chi, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bin: '970422', accountNumber: '0123456789', holderName: 'Trần Thị Chi', consent: true }),
    });
    expect(put.status).toBe(204);
    const headers = await minh();
    const v = await json<TripView>(call(base, { headers }));
    const { bankId } = v.approvals.find((a) => a.kind === 'bank') as { bankId: string };
    vi.spyOn(env.DB, 'batch').mockRejectedValueOnce(new Error('boom'));

    const res = await post(`/bank/${bankId}/approve`, headers);
    expect(res.status).toBe(500);
    expect(await status('bank_details', bankId)).toBe('pending');
  });

  it('a failed batch leaves an approved income approved on disable', async () => {
    await makeSport();
    await seedIncome({ id: 'i-1', amount: 200000 });
    const headers = await minh();
    vi.spyOn(env.DB, 'batch').mockRejectedValueOnce(new Error('boom'));

    const res = await post('/fund/incomes/i-1/disable', headers);
    expect(res.status).toBe(500);
    expect(await status('transactions', 'i-1')).toBe('approved');
  });
});
