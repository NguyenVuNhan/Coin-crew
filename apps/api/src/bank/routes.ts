import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { MyBankResponse, PayInfo } from '@fsl/core';
import { buildVietQrPayload, can, equalBillShare, findBank, isFundPaid, maskAccountNumber, toTransferNote } from '@fsl/core';
import type { AppBindings } from '../env';
import type { Db } from '../db/client';
import { getDb } from '../db/client';
import { bankDetails, participants } from '../db/schema';
import { getSessionUser, requireUser } from '../auth/session';
import { assertWritable, resolveActor } from '../access/actor';
import { ensure } from '../access/guard';
import { commitTripWrite } from '../lib/commit';
import { ApiError } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';
import { getOrCreateRefCode } from '../payments/refs';
import { getSnapshot } from '../trips/snapshot';

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

interface ValidatedBankInput {
  bin: string;
  accountNumber: string;
  holderName: string;
}

function validateBankInput(body: unknown): ValidatedBankInput {
  if (!body || typeof body !== 'object') {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }

  const input = body as Record<string, unknown>;

  if (input.consent !== true) {
    throw new ApiError('VALIDATION', 422, 'Consent is required');
  }

  if (typeof input.bin !== 'string' || !findBank(input.bin)) {
    throw new ApiError('VALIDATION', 422, 'Invalid bank BIN');
  }

  if (typeof input.accountNumber !== 'string' || !/^\d{6,19}$/.test(input.accountNumber)) {
    throw new ApiError('VALIDATION', 422, 'Invalid account number');
  }

  if (typeof input.holderName !== 'string') {
    throw new ApiError('VALIDATION', 422, 'Invalid holder name');
  }

  const holderName = toTransferNote(input.holderName, 50);
  if (!holderName) {
    throw new ApiError('VALIDATION', 422, 'Invalid holder name');
  }

  return {
    bin: input.bin,
    accountNumber: input.accountNumber,
    holderName,
  };
}

async function saveMemberBank(
  db: Db,
  userId: string,
  input: ValidatedBankInput,
  deviceHash: string | null,
): Promise<void> {
  const now = nowIso();

  const updateReplaced = db
    .update(bankDetails)
    .set({ status: 'replaced' })
    .where(
      and(
        eq(bankDetails.userId, userId),
        inArray(bankDetails.status, ['approved', 'pending']),
      ),
    );

  const insertApproved = db.insert(bankDetails).values({
    id: newId(),
    userId,
    participantId: null,
    bin: input.bin,
    accountNumber: input.accountNumber,
    holderName: input.holderName,
    status: 'approved',
    approvedByUserId: userId,
    consentAt: now,
    createdAt: now,
  });

  const memberParticipants = await db
    .select({
      tripId: participants.tripId,
      participantId: participants.id,
    })
    .from(participants)
    .where(
      and(
        eq(participants.userId, userId),
        eq(participants.status, 'active'),
      ),
    );

  const tripMap = new Map<string, string>();
  for (const p of memberParticipants) {
    if (!tripMap.has(p.tripId)) {
      tripMap.set(p.tripId, p.participantId);
    }
  }

  const tripsList = Array.from(tripMap.entries()).map(([tripId, participantId]) => ({
    tripId,
    participantId,
  }));

  if (tripsList.length === 0) {
    await db.batch([updateReplaced, insertApproved] as unknown as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
    return;
  }

  const first = tripsList[0]!;
  await commitTripWrite(db, first.tripId, [updateReplaced, insertApproved], {
    action: 'bank_submitted',
    actorUserId: userId,
    actorParticipantId: first.participantId,
    actorDevice: deviceHash,
    details: { member: true },
  });

  for (let i = 1; i < tripsList.length; i++) {
    const item = tripsList[i]!;
    await commitTripWrite(db, item.tripId, [], {
      action: 'bank_submitted',
      actorUserId: userId,
      actorParticipantId: item.participantId,
      actorDevice: deviceHash,
      details: { member: true },
    });
  }
}

/** The guest whose bank details a member manages: an active person in this trip without an account. */
async function guestTarget(db: Db, tripId: string, participantId: string): Promise<string> {
  const person = await db
    .select({ id: participants.id, userId: participants.userId })
    .from(participants)
    .where(
      and(
        eq(participants.id, participantId),
        eq(participants.tripId, tripId),
        eq(participants.status, 'active'),
      ),
    )
    .get();

  if (!person) {
    throw new ApiError('NOT_FOUND', 404);
  }
  if (person.userId !== null) {
    throw new ApiError('FORBIDDEN', 403, 'Members manage their own bank details.');
  }
  return person.id;
}

function liveGuestBank(participantId: string) {
  return and(
    eq(bankDetails.participantId, participantId),
    inArray(bankDetails.status, ['approved', 'pending']),
  );
}

export function bankRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // GET /me/bank
  app.get('/me/bank', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);
    const row = await db
      .select({
        bin: bankDetails.bin,
        accountNumber: bankDetails.accountNumber,
        holderName: bankDetails.holderName,
      })
      .from(bankDetails)
      .where(
        and(
          eq(bankDetails.userId, user.id),
          eq(bankDetails.status, 'approved'),
        ),
      )
      .orderBy(desc(bankDetails.createdAt))
      .get();

    return c.json<MyBankResponse | null>(row ?? null);
  });

  // PUT /me/bank
  app.put('/me/bank', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await parseJson<unknown>(c);
    const input = validateBankInput(body);
    const db = getDb(c.env);
    const deviceHash = c.get('deviceHash') ?? null;

    await saveMemberBank(db, user.id, input, deviceHash);
    return c.body(null, 204);
  });

  // PUT /trips/:id/bank
  app.put('/trips/:id/bank', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'set_own_bank');

    if (!actor.participantId) {
      throw new ApiError('FORBIDDEN', 403, 'Pick your name first.');
    }

    const body = await parseJson<unknown>(c);
    const input = validateBankInput(body);

    const db = getDb(c.env);

    if (actor.kind === 'member' && actor.userId) {
      await saveMemberBank(db, actor.userId, input, actor.deviceHash);
      return c.body(null, 204);
    }

    // Guests: replace details while they wait; once approved, only a member changes them.
    const approved = await db
      .select({ id: bankDetails.id })
      .from(bankDetails)
      .where(
        and(
          eq(bankDetails.participantId, actor.participantId),
          eq(bankDetails.status, 'approved'),
        ),
      )
      .get();
    if (!can(actor, 'set_own_bank', { bankApproved: approved !== undefined })) {
      throw new ApiError('FORBIDDEN', 403, 'Ask a member to change your bank details.');
    }

    const now = nowIso();
    const updatePending = db
      .update(bankDetails)
      .set({ status: 'replaced' })
      .where(
        and(
          eq(bankDetails.participantId, actor.participantId),
          eq(bankDetails.status, 'pending'),
        ),
      );

    const insertPending = db.insert(bankDetails).values({
      id: newId(),
      participantId: actor.participantId,
      userId: null,
      bin: input.bin,
      accountNumber: input.accountNumber,
      holderName: input.holderName,
      status: 'pending',
      consentAt: now,
      createdAt: now,
    });

    await commitTripWrite(db, tripId, [updatePending, insertPending], {
      action: 'bank_submitted',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { participantId: actor.participantId },
    });

    return c.body(null, 204);
  });

  // PUT /trips/:id/people/:pid/bank: a member saves a guest's details; they count straight away.
  app.put('/trips/:id/people/:pid/bank', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'manage_bank');

    const db = getDb(c.env);
    const participantId = await guestTarget(db, tripId, c.req.param('pid'));
    const input = validateBankInput(await parseJson<unknown>(c));
    const now = nowIso();

    const replaceLive = db
      .update(bankDetails)
      .set({ status: 'replaced' })
      .where(liveGuestBank(participantId));

    const insertApproved = db.insert(bankDetails).values({
      id: newId(),
      participantId,
      userId: null,
      bin: input.bin,
      accountNumber: input.accountNumber,
      holderName: input.holderName,
      status: 'approved',
      approvedByUserId: actor.userId,
      consentAt: now,
      createdAt: now,
    });

    await commitTripWrite(db, tripId, [replaceLive, insertApproved], {
      action: 'bank_set',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { participantId },
    });

    return c.body(null, 204);
  });

  // DELETE /trips/:id/people/:pid/bank: a member removes a guest's details (approved or waiting).
  app.delete('/trips/:id/people/:pid/bank', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'manage_bank');

    const db = getDb(c.env);
    const participantId = await guestTarget(db, tripId, c.req.param('pid'));

    const live = await db
      .select({ id: bankDetails.id })
      .from(bankDetails)
      .where(liveGuestBank(participantId))
      .get();
    if (!live) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const removeLive = db
      .update(bankDetails)
      .set({ status: 'removed' })
      .where(liveGuestBank(participantId));

    await commitTripWrite(db, tripId, [removeLive], {
      action: 'bank_removed',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { participantId },
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/bank/:bid/approve
  app.post('/trips/:id/bank/:bid/approve', async (c) => {
    const tripId = c.req.param('id');
    const bid = c.req.param('bid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'approve');

    const db = getDb(c.env);
    const row = await db
      .select({
        id: bankDetails.id,
        participantId: bankDetails.participantId,
      })
      .from(bankDetails)
      .innerJoin(participants, eq(bankDetails.participantId, participants.id))
      .where(
        and(
          eq(bankDetails.id, bid),
          eq(participants.tripId, tripId),
        ),
      )
      .get();

    if (!row || !row.participantId) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const r = await db
      .update(bankDetails)
      .set({
        status: 'approved',
        approvedByUserId: actor.userId,
      })
      .where(
        and(
          eq(bankDetails.id, bid),
          eq(bankDetails.status, 'pending'),
        ),
      )
      .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    const replaceOthers = db
      .update(bankDetails)
      .set({ status: 'replaced' })
      .where(
        and(
          eq(bankDetails.participantId, row.participantId),
          eq(bankDetails.status, 'approved'),
          ne(bankDetails.id, bid),
        ),
      );

    await commitTripWrite(db, tripId, [replaceOthers], {
      action: 'bank_approved',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { participantId: row.participantId },
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/bank/:bid/reject
  app.post('/trips/:id/bank/:bid/reject', async (c) => {
    const tripId = c.req.param('id');
    const bid = c.req.param('bid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'approve');

    const db = getDb(c.env);
    const row = await db
      .select({
        id: bankDetails.id,
        participantId: bankDetails.participantId,
      })
      .from(bankDetails)
      .innerJoin(participants, eq(bankDetails.participantId, participants.id))
      .where(
        and(
          eq(bankDetails.id, bid),
          eq(participants.tripId, tripId),
        ),
      )
      .get();

    if (!row || !row.participantId) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const r = await db
      .update(bankDetails)
      .set({
        status: 'rejected',
      })
      .where(
        and(
          eq(bankDetails.id, bid),
          eq(bankDetails.status, 'pending'),
        ),
      )
      .run();

    if (r.meta.changes === 0) {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await commitTripWrite(db, tripId, [], {
      action: 'bank_rejected',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { participantId: row.participantId },
    });

    return c.body(null, 204);
  });

  // GET /trips/:id/pay/:toId
  app.get('/trips/:id/pay/:toId', async (c) => {
    const tripId = c.req.param('id');
    const toId = c.req.param('toId');
    const actor = await resolveActor(c, tripId);
    const db = getDb(c.env);

    const toParticipant = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.id, toId),
          eq(participants.tripId, tripId),
          // Someone who left can still be paid what they are owed.
          inArray(participants.status, ['active', 'pending', 'left']),
        ),
      )
      .get();

    if (!toParticipant) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const self = actor.participantId === toId;

    // ?from=<payer>: the receiver asks for their own bank details and QR for one specific payer.
    // Without it, the caller is the payer.
    const fromParam = c.req.query('from');
    const forPayer = fromParam !== undefined;
    let payerId = actor.participantId;
    if (forPayer) {
      if (!self) {
        throw new ApiError('FORBIDDEN', 403);
      }
      const fromParticipant = await db
        .select({ id: participants.id })
        .from(participants)
        .where(
          and(
            eq(participants.id, fromParam),
            eq(participants.tripId, tripId),
            inArray(participants.status, ['active', 'pending', 'left']),
          ),
        )
        .get();
      if (!fromParticipant || fromParticipant.id === toId) {
        throw new ApiError('NOT_FOUND', 404);
      }
      payerId = fromParticipant.id;
    }

    const isBill = c.req.query('bill') === '1';
    const snapshot = await getSnapshot(db, actor.trip);
    const suggestion = snapshot.suggestions.find(
      (s) => s.fromId === payerId && s.toId === toId,
    );

    // A "says paid" payment removes the debt from the suggestions, but the payer still needs this screen
    // (and the receiver's details) while it waits for confirmation.
    const waiting = snapshot.payments.some((p) => p.status === 'says_paid' && p.fromId === payerId && p.toId === toId);
    // A fund-paid expense names the admin who recorded it, but nobody owes them for it.
    const isExpensePayer = isBill && snapshot.expenses.some((e) => e.payerId === toId && (e.status === 'approved' || e.status === 'pending') && !isFundPaid(e));
    ensure(actor, 'view_bank', { owesTo: self || suggestion !== undefined || waiting, isExpensePayer });

    const amount = self && !forPayer ? 0 : (suggestion?.amount ?? 0);

    let approvedRow: typeof bankDetails.$inferSelect | undefined;
    let guestHasPending = false;

    if (toParticipant.userId !== null) {
      approvedRow = await db
        .select()
        .from(bankDetails)
        .where(
          and(
            eq(bankDetails.userId, toParticipant.userId),
            eq(bankDetails.status, 'approved'),
          ),
        )
        .get();
    } else {
      approvedRow = await db
        .select()
        .from(bankDetails)
        .where(
          and(
            eq(bankDetails.participantId, toParticipant.id),
            eq(bankDetails.status, 'approved'),
          ),
        )
        .get();

      if (!approvedRow) {
        const pendingRow = await db
          .select({ id: bankDetails.id })
          .from(bankDetails)
          .where(
            and(
              eq(bankDetails.participantId, toParticipant.id),
              eq(bankDetails.status, 'pending'),
            ),
          )
          .get();
        guestHasPending = pendingRow !== undefined;
      }
    }

    const bankState: PayInfo['bankState'] = approvedRow
      ? 'ok'
      : (guestHasPending ? 'pending' : 'none');

    const bank: PayInfo['bank'] = approvedRow
      ? {
          bin: approvedRow.bin,
          bankName: findBank(approvedRow.bin)?.shortName ?? approvedRow.bin,
          accountNumber: approvedRow.accountNumber,
          accountNumberMasked: maskAccountNumber(approvedRow.accountNumber),
          holderName: approvedRow.holderName,
        }
      : null;

    const refCode = payerId && payerId !== toId
      ? await getOrCreateRefCode(db, actor.trip, payerId, toId)
      : '';

    // The payer's screen keeps its QR while a payment waits for confirmation (amount 0); the receiver's
    // QR only exists while something is owed.
    let payload: string | null = null;
    if (isBill) {
      if (bankState === 'ok' && approvedRow) {
        const billNote = refCode || toTransferNote(actor.trip.name, 25);
        // The bill of one expense this person paid asks for the share when everyone owes the same.
        const expenseId = c.req.query('expense');
        const billExpense = expenseId
          ? snapshot.expenses.find(
              (e) =>
                (e.id === expenseId || e.rootId === expenseId) &&
                e.payerId === toId &&
                (e.status === 'approved' || e.status === 'pending') &&
                !isFundPaid(e),
            )
          : undefined;
        payload = buildVietQrPayload({
          bin: approvedRow.bin,
          accountNumber: approvedRow.accountNumber,
          amount: billExpense ? (equalBillShare(billExpense) ?? 0) : 0,
          note: billNote,
        });
      }
    } else {
      payload =
        bankState === 'ok' && approvedRow && (forPayer ? amount > 0 : !self)
          ? buildVietQrPayload({
              bin: approvedRow.bin,
              accountNumber: approvedRow.accountNumber,
              amount,
              note: refCode,
            })
          : null;
    }

    const inFlight = snapshot.payments.filter(
      (p) =>
        p.status === 'says_paid' &&
        p.fromId === payerId &&
        p.toId === toId,
    );

    return c.json<PayInfo>({
      to: {
        id: toParticipant.id,
        name: toParticipant.name,
      },
      amount,
      bankState,
      bank,
      refCode,
      payload,
      inFlight,
    });
  });

  return app;
}
