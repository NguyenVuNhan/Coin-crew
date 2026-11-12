import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@cc/api-db/client';
import { guardedTripWrite, type ActivityInput } from '@cc/api-db/commit';
import { transactions, transactionShares } from '@cc/api-db/schema';
import { ApiError } from '@cc/api-util/errors';
import { seedTrip, T, PID } from './helpers';

const TX = 'e-guard';
const NOW = '2026-10-20T00:00:00.000Z';

const ACTIVITY: ActivityInput = {
  action: 'expense_approved',
  actorParticipantId: PID.M,
  actorUserId: null,
  actorDevice: null,
  details: { transactionId: TX },
};

async function run(query: string, ...binds: unknown[]) {
  await env.DB.prepare(query).bind(...binds).run();
}

async function seedPending() {
  await seedTrip();
  await run(
    "INSERT INTO transactions (id, root_id, parent_id, is_latest, trip_id, type, description, amount, currency, spent_on, payer_id, split_mode, status, created_by_participant_id, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, 'expense', 'x', 200, 'VND', '2026-10-10', ?, 'equal', 'pending', ?, ?, ?)",
    TX, TX, T.tripId, PID.M, PID.A, NOW, NOW,
  );
  await run('INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, 100)', TX, PID.M);
  await run('INSERT INTO transaction_shares (transaction_id, participant_id, input_value, amount) VALUES (?, ?, 1, 100)', TX, PID.A);
}

async function state() {
  const tx = await env.DB.prepare('SELECT status FROM transactions WHERE id = ?').bind(TX).first<{ status: string }>();
  const share = await env.DB.prepare('SELECT amount FROM transaction_shares WHERE transaction_id = ? AND participant_id = ?')
    .bind(TX, PID.M).first<{ amount: number }>();
  const trip = await env.DB.prepare('SELECT version FROM trips WHERE id = ?').bind(T.tripId).first<{ version: number }>();
  const acts = await env.DB.prepare('SELECT action FROM activity WHERE trip_id = ?').bind(T.tripId).all<{ action: string }>();
  return { status: tx!.status, shareAmount: share!.amount, version: trip!.version, activity: acts.results.map((r) => r.action) };
}

function approveGuard() {
  const db = getDb(env);
  return db.update(transactions).set({ status: 'approved' })
    .where(and(eq(transactions.id, TX), eq(transactions.status, 'pending')));
}

function bumpShare(by: number) {
  const db = getDb(env);
  return db.update(transactionShares).set({ amount: 100 + by })
    .where(and(eq(transactionShares.transactionId, TX), eq(transactionShares.participantId, PID.M)));
}

describe('guardedTripWrite', () => {
  beforeEach(seedPending);

  it('guard hit commits guard, follow-ups, version bump and activity', async () => {
    const before = await state();
    await guardedTripWrite(getDb(env), T.tripId, approveGuard(), [bumpShare(5)], ACTIVITY);
    const after = await state();
    expect(after.status).toBe('approved');
    expect(after.shareAmount).toBe(105);
    expect(after.version).toBe(before.version + 1);
    expect(after.activity).toEqual([...before.activity, 'expense_approved']);
  });

  it('guard miss writes nothing and throws onMiss', async () => {
    const db = getDb(env);
    await guardedTripWrite(db, T.tripId, approveGuard(), [bumpShare(5)], ACTIVITY);
    const mid = await state();

    const err = await guardedTripWrite(db, T.tripId, approveGuard(), [bumpShare(9)], ACTIVITY).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('ALREADY_HANDLED');
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).message).toBe('Someone already handled this.');

    const after = await state();
    expect(after).toEqual(mid);
    expect(after.shareAmount).toBe(105);
  });

  it('custom onMiss error is thrown on miss', async () => {
    const db = getDb(env);
    await guardedTripWrite(db, T.tripId, approveGuard(), [], ACTIVITY);
    const err = await guardedTripWrite(db, T.tripId, approveGuard(), [], ACTIVITY, () => new ApiError('CONFLICT', 409, 'x'))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('CONFLICT');
    expect((err as ApiError).message).toBe('x');
  });

  it('guard matching a row with identical values still commits', async () => {
    const db = getDb(env);
    const before = await state();
    // Sets status to the value it already has: the row matches, so changes() counts it.
    const sameValueGuard = db.update(transactions).set({ status: 'pending' })
      .where(and(eq(transactions.id, TX), eq(transactions.status, 'pending')));
    await guardedTripWrite(db, T.tripId, sameValueGuard, [bumpShare(1)], ACTIVITY);
    const after = await state();
    expect(after.status).toBe('pending');
    expect(after.shareAmount).toBe(101);
    expect(after.version).toBe(before.version + 1);
    expect(after.activity).toEqual([...before.activity, 'expense_approved']);
  });

  it('other constraint failures are rethrown, not 409', async () => {
    const db = getDb(env);
    const before = await state();
    // The guard hits, but this follow-up clashes with the share row's primary key.
    const duplicateShare = db.insert(transactionShares).values({ transactionId: TX, participantId: PID.M, inputValue: 1, amount: 1 });
    const err = await guardedTripWrite(db, T.tripId, approveGuard(), [bumpShare(5), duplicateShare], ACTIVITY)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ApiError);

    const after = await state();
    expect(after).toEqual(before);
    expect(after.status).toBe('pending');
  });
});
