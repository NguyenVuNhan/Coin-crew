import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { call, guestHeaders, PID, seedExpenses, seedTrip, T } from './helpers';
import { makeSport } from './fund-helpers';

const base = `/api/trips/${T.tripId}`;

// Chi pays nothing and owes everyone, so only an expense she paid could open her bank details to Bình.
async function seedExpenseByChi(meta: string | null): Promise<void> {
  await env.DB.prepare("INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, meta_json, created_at, updated_at) VALUES ('e-c', 'e-c', NULL, 1, ?, 'expense', 'Thuê sân', 300000, 'VND', '2026-10-26', ?, 'equal', 'approved', ?, ?, '2026-10-26T00:00:00.000Z', '2026-10-26T00:00:00.000Z')")
    .bind(T.tripId, PID.C, PID.C, meta).run();
}

beforeEach(async () => {
  await seedTrip();
  await seedExpenses();
  await makeSport();
});

describe('?bill=1 and fund-paid expenses', () => {
  it('recording a fund-paid expense does not open the recorder\'s bank details', async () => {
    await seedExpenseByChi('{"paidFromFund":true}');
    expect((await call(`${base}/pay/${PID.C}?bill=1`, { headers: await guestHeaders(PID.B) })).status).toBe(403);
  });

  it('an expense Chi paid herself still does', async () => {
    await seedExpenseByChi(null);
    expect((await call(`${base}/pay/${PID.C}?bill=1`, { headers: await guestHeaders(PID.B) })).status).toBe(200);
  });
});
