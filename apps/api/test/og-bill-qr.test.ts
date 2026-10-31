import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { seedTrip, seedMinhBank, T, PID } from './helpers';
import { getDb } from '../src/db/client';
import { trips } from '../src/db/schema';
import { getSnapshot } from '../src/trips/snapshot';
import { billQrPayload } from '../src/og/billQr';

/** A sport bill paid by Minh, with these shares. */
async function seedSportBill(shares: [string, number][]): Promise<void> {
  const total = shares.reduce((sum, [, amount]) => sum + amount, 0);
  const metaJson = JSON.stringify({
    sport: {
      court: total,
      shuttlecocks: [],
      extra: 0,
      maleSlotRate: 0,
      femaleSlotRate: 0,
      rule: { kind: 'equal' },
      entries: shares.map(([participantId]) => ({ participantId, maleSlots: 1, femaleSlots: 0 })),
    },
  });
  await env.DB.prepare(
    `INSERT INTO transactions (
      id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency,
      spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at, meta_json
    ) VALUES ('e-sport', 'e-sport', NULL, 1, 't-1', 'expense', 'Cầu lông', ?, 'VND', '2026-10-11', ?, 'equal', 'approved', ?, '2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z', ?)`,
  )
    .bind(total, PID.M, PID.M, metaJson)
    .run();
  await env.DB.batch(
    shares.map(([participantId, amount]) =>
      env.DB.prepare(
        "INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES ('e-sport', ?, 1, ?)",
      ).bind(participantId, amount),
    ),
  );
}

async function payload(): Promise<string | null> {
  const db = getDb(env);
  const trip = await db.select().from(trips).where(eq(trips.id, T.tripId)).get();
  const snapshot = await getSnapshot(db, trip!);
  const expense = snapshot.expenses.find((e) => e.id === 'e-sport')!;
  return billQrPayload(db, snapshot, expense);
}

/** The amount field (tag 54) of a VietQR payload, or null when it asks for no amount. */
function qrAmount(p: string): number | null {
  let at = 0;
  while (at < p.length) {
    const tag = p.slice(at, at + 2);
    const len = Number(p.slice(at + 2, at + 4));
    if (tag === '54') return Number(p.slice(at + 4, at + 4 + len));
    at += 4 + len;
  }
  return null;
}

describe('billQrPayload amount', () => {
  beforeEach(async () => {
    await seedTrip();
    await seedMinhBank();
  });

  it('asks for the share when everyone else owes the same', async () => {
    await seedSportBill([[PID.M, 100000], [PID.A, 100000], [PID.B, 100000], [PID.C, 100000]]);
    expect(qrAmount((await payload())!)).toBe(100000);
  });

  it('asks for the larger share when the split only differs by a rounding dong', async () => {
    await seedSportBill([[PID.M, 166666], [PID.A, 166667], [PID.B, 166667], [PID.C, 166666]]);
    expect(qrAmount((await payload())!)).toBe(166667);
  });

  it('asks for no amount when the shares differ', async () => {
    await seedSportBill([[PID.M, 100000], [PID.A, 150000], [PID.B, 100000], [PID.C, 100000]]);
    expect(qrAmount((await payload())!)).toBeNull();
  });
});
