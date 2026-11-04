import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { call, memberSid, PID, seedTrip, T, U } from './helpers';
import { getDb } from '../src/db/client';
import { requestClaim, upsertIdentity } from '../src/auth/identity';

const CREATED = '2026-10-12T00:00:00.000Z';

async function run(query: string, ...binds: unknown[]): Promise<void> {
  await env.DB.prepare(query).bind(...binds).run();
}

async function txRow(id: string) {
  return env.DB.prepare('SELECT status, amount_confirmed, confirmed_by_participant_id, claim_request_id FROM transactions WHERE id = ?')
    .bind(id)
    .first<{ status: string; amount_confirmed: number | null; confirmed_by_participant_id: string | null; claim_request_id: string | null }>();
}

/** A Zalo account claims Minh, then "pays" 100k from Minh to a guest. */
async function claimPaymentToGuest(id: string, claim: boolean): Promise<string> {
  await seedTrip();
  const zaloUserId = await upsertIdentity(getDb(env), 'zalo', { sub: `z-${id}`, name: 'Minh Zalo', avatarUrl: null });
  const outcome = await requestClaim(getDb(env), zaloUserId, { tripId: T.tripId, participantId: PID.M });
  if (outcome.result !== 'requested') throw new Error('expected requested');
  await run(
    `INSERT INTO transactions
      (id, root_id, trip_id, type, description, amount, spent_on, payer_id, to_id, status, created_by_participant_id, claim_request_id, created_at, updated_at)
     VALUES (?, ?, ?, 'payment', '', 100000, '2026-10-12', ?, ?, 'says_paid', ?, ?, ?, ?)`,
    id, id, T.tripId, PID.M, PID.A, PID.M, claim ? outcome.requestId : null, CREATED, CREATED,
  );
  await run(
    'INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 100000, 100000)',
    id, PID.A,
  );
  return outcome.requestId;
}

const confirm = (id: string, sid: string) =>
  call(`/api/trips/${T.tripId}/payments/${id}/confirm`, { method: 'POST', headers: { Cookie: `sid=${sid}` } });

describe('claim payment to a guest', () => {
  it('is confirmed automatically when the merge is accepted', async () => {
    const requestId = await claimPaymentToGuest('tx-g1', true);
    const minhSid = await memberSid(U.minh, 'Minh');
    const res = await call(`/api/me/merge-requests/${requestId}/accept`, { method: 'POST', headers: { Cookie: `sid=${minhSid}` } });
    expect(res.status).toBe(200);
    expect(await txRow('tx-g1')).toEqual({ status: 'confirmed', amount_confirmed: 100000, confirmed_by_participant_id: PID.M, claim_request_id: null });
  });

  it('the organiser (admin) may confirm it while the merge waits', async () => {
    await claimPaymentToGuest('tx-g2', true);
    const minhSid = await memberSid(U.minh, 'Minh');
    expect((await confirm('tx-g2', minhSid)).status).toBe(204);
    expect((await txRow('tx-g2'))?.status).toBe('confirmed');
  });

  it('an admin still cannot confirm an ordinary waiting payment to a guest', async () => {
    await claimPaymentToGuest('tx-g3', false);
    const minhSid = await memberSid(U.minh, 'Minh');
    expect((await confirm('tx-g3', minhSid)).status).toBe(403);
    expect((await txRow('tx-g3'))?.status).toBe('says_paid');
  });
});
