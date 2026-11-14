import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type {
  ExpenseInput,
  ExpenseMeta,
  ExpenseSportMeta,
  ExpenseStatus,
  FundItem,
  SplitEntry,
  SplitMode,
  SportCourtSlot,
  SportLocationSnapshot,
  SportParticipantEntry,
  SportRule,
} from '@cc/core';
import {
  computeShares,
  computeSportShares,
  initialExpenseStatus,
  isFundPaid,
  isPlanningExpense,
  MAX_AMOUNT,
} from '@cc/core';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import { participants, transactions, transactionShares } from '@cc/api-db/schema';
import { assertWritable, resolveActor, type ResolvedActor } from '@cc/api-auth/actor';
import { ensure } from '@cc/api-auth/guard';
import { assertFundCovers, assertSportGroup, currentFundBalance } from '../fund/check';
import { commitTripWrite, guardedTripWrite } from '@cc/api-db/commit';
import { ApiError, validationError } from '@cc/api-util/errors';
import { newId, nowIso } from '@cc/api-util/ids';
import { dispatchExpenseNotification } from '../notifications/transactionDispatcher';
import { dispatchExpensePush, dispatchSessionPush, sessionSnapshotOf } from '../notifications/push/dispatch';
import { countPendingSessions } from '../attendance/count';
import { safeError } from '@cc/api-util/logSafe';

async function parseJson<T>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>();
  } catch {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }
}

const SPLIT_MODES: ReadonlySet<SplitMode> = new Set([
  'equal',
  'amounts',
  'percent',
  'shares',
  'adjust',
]);

export type TransactionRow = typeof transactions.$inferSelect;

export interface ValidatedExpense {
  description: string;
  amount: number;
  spentOn: string;
  payerId: string;
  mode: SplitMode;
  shares: { participantId: string; inputValue: number; inputAuto: 0 | 1; amount: number }[];
  meta?: ExpenseMeta | null;
}

function validateSportExtended(sport: Record<string, unknown>): {
  location?: SportLocationSnapshot | null;
  courtSlots?: SportCourtSlot[];
  bookingCode?: string | null;
  totalDuration?: string | null;
  bookingImageDataUrl?: string | null;
} {
  const result: {
    location?: SportLocationSnapshot | null;
    courtSlots?: SportCourtSlot[];
    bookingCode?: string | null;
    totalDuration?: string | null;
    bookingImageDataUrl?: string | null;
  } = {};

  if (sport.location !== undefined && sport.location !== null) {
    if (typeof sport.location !== 'object' || Array.isArray(sport.location)) {
      throw new ApiError('VALIDATION', 422, 'Invalid location');
    }
    const loc = sport.location as Record<string, unknown>;
    if (typeof loc.name !== 'string' || loc.name.trim().length < 1 || loc.name.trim().length > 120) {
      throw new ApiError('VALIDATION', 422, 'Invalid location name');
    }
    if (typeof loc.address !== 'string' || loc.address.trim().length < 1 || loc.address.trim().length > 200) {
      throw new ApiError('VALIDATION', 422, 'Invalid location address');
    }
    if (loc.phone !== undefined && loc.phone !== null && (typeof loc.phone !== 'string' || loc.phone.length > 40)) {
      throw new ApiError('VALIDATION', 422, 'Invalid location phone');
    }
    let mapUrlVal: string | null | undefined = undefined;
    if (loc.mapUrl !== undefined) {
      if (loc.mapUrl === null) {
        mapUrlVal = null;
      } else if (typeof loc.mapUrl !== 'string') {
        throw new ApiError('VALIDATION', 422, 'Invalid location mapUrl');
      } else {
        const trimmed = loc.mapUrl.trim();
        if (trimmed.length === 0) {
          mapUrlVal = null;
        } else if (trimmed.length > 500 || !/^https?:\/\/\S+$/i.test(trimmed)) {
          throw validationError('mapUrl', 'Invalid location mapUrl');
        } else {
          mapUrlVal = trimmed;
        }
      }
    }
    if (loc.locationId !== undefined && loc.locationId !== null && (typeof loc.locationId !== 'string' || loc.locationId.length > 40)) {
      throw new ApiError('VALIDATION', 422, 'Invalid location locationId');
    }
    result.location = {
      name: loc.name.trim(),
      address: loc.address.trim(),
      ...(loc.locationId !== undefined ? { locationId: loc.locationId as string | null } : {}),
      ...(loc.phone !== undefined ? { phone: loc.phone as string | null } : {}),
      ...(loc.mapUrl !== undefined ? { mapUrl: mapUrlVal } : {}),
    };
  } else if (sport.location === null) {
    result.location = null;
  }

  if (sport.courtSlots !== undefined && sport.courtSlots !== null) {
    if (!Array.isArray(sport.courtSlots) || sport.courtSlots.length > 10) {
      throw new ApiError('VALIDATION', 422, 'Invalid court slots');
    }
    const slots: SportCourtSlot[] = [];
    for (const slot of sport.courtSlots) {
      if (!slot || typeof slot !== 'object') {
        throw new ApiError('VALIDATION', 422, 'Invalid court slot');
      }
      const cs = slot as Record<string, unknown>;
      if (
        typeof cs.courtName !== 'string' ||
        cs.courtName.trim().length < 1 ||
        cs.courtName.trim().length > 40 ||
        typeof cs.timeRange !== 'string' ||
        cs.timeRange.trim().length < 1 ||
        cs.timeRange.trim().length > 40
      ) {
        throw new ApiError('VALIDATION', 422, 'Invalid court slot values');
      }
      slots.push({
        courtName: cs.courtName.trim(),
        timeRange: cs.timeRange.trim(),
      });
    }
    result.courtSlots = slots;
  }

  if (sport.bookingCode !== undefined && sport.bookingCode !== null) {
    if (typeof sport.bookingCode !== 'string' || sport.bookingCode.length > 40) {
      throw new ApiError('VALIDATION', 422, 'Invalid booking code');
    }
    result.bookingCode = sport.bookingCode;
  } else if (sport.bookingCode === null) {
    result.bookingCode = null;
  }

  if (sport.totalDuration !== undefined && sport.totalDuration !== null) {
    if (typeof sport.totalDuration !== 'string' || sport.totalDuration.length > 40) {
      throw new ApiError('VALIDATION', 422, 'Invalid total duration');
    }
    result.totalDuration = sport.totalDuration;
  } else if (sport.totalDuration === null) {
    result.totalDuration = null;
  }

  if (sport.bookingImageDataUrl !== undefined && sport.bookingImageDataUrl !== null) {
    if (
      typeof sport.bookingImageDataUrl !== 'string' ||
      sport.bookingImageDataUrl.length > 80_000 ||
      !sport.bookingImageDataUrl.startsWith('data:image/')
    ) {
      throw new ApiError('VALIDATION', 422, 'Invalid booking image');
    }
    result.bookingImageDataUrl = sport.bookingImageDataUrl;
  } else if (sport.bookingImageDataUrl === null) {
    result.bookingImageDataUrl = null;
  }

  return result;
}

/** `allowedLeftIds`: people who left but are already on the expense being edited, so they may stay on it. */
async function validateExpenseInput(
  db: Db,
  tripId: string,
  body: unknown,
  allowedLeftIds: ReadonlySet<string>,
): Promise<ValidatedExpense> {
  if (!body || typeof body !== 'object') {
    throw new ApiError('VALIDATION', 422, 'Invalid request');
  }

  const input = body as Record<string, unknown>;

  if (typeof input.description !== 'string') {
    throw new ApiError('VALIDATION', 422, 'Invalid description');
  }
  const description = input.description.trim();
  if (description.length < 1 || description.length > 80) {
    throw validationError('descriptionLength', 'Description must be 1 to 80 characters');
  }

  if (typeof input.amount !== 'number') {
    throw new ApiError('VALIDATION', 422, 'INVALID_AMOUNT');
  }
  const amount = input.amount;

  if (typeof input.spentOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.spentOn)) {
    throw new ApiError('VALIDATION', 422, 'Invalid spentOn');
  }
  const spentOn = input.spentOn;

  if (typeof input.mode !== 'string' || !SPLIT_MODES.has(input.mode as SplitMode)) {
    throw new ApiError('VALIDATION', 422, 'Invalid split mode');
  }
  const mode = input.mode as SplitMode;

  if (typeof input.payerId !== 'string') {
    throw new ApiError('VALIDATION', 422, 'Invalid payer');
  }
  const payerId = input.payerId;

  if (!Array.isArray(input.entries)) {
    throw new ApiError('VALIDATION', 422, 'Invalid entries');
  }

  const seenIds = new Set<string>();
  const entries: SplitEntry[] = [];
  for (const entry of input.entries) {
    if (!entry || typeof entry !== 'object') {
      throw new ApiError('VALIDATION', 422, 'Invalid entry');
    }
    const pid = (entry as Record<string, unknown>).participantId;
    const val = (entry as Record<string, unknown>).value;
    // A null value is a blank box; core says which split modes allow one.
    if (typeof pid !== 'string' || (typeof val !== 'number' && val !== null)) {
      throw new ApiError('VALIDATION', 422, 'Invalid entry');
    }
    if (seenIds.has(pid)) {
      throw new ApiError('VALIDATION', 422, 'Duplicate participant in entries');
    }
    seenIds.add(pid);
    entries.push({ participantId: pid, value: val });
  }

  // Paid from the group fund: the whole amount came out of group money, so there is no split and nobody gets a share (spec §6.2).
  const paidFromFund =
    input.meta && typeof input.meta === 'object' ? (input.meta as Record<string, unknown>).paidFromFund : undefined;
  if (paidFromFund !== undefined && paidFromFund !== true) {
    throw new ApiError('VALIDATION', 422, 'Invalid paidFromFund');
  }
  if (paidFromFund === true) {
    const sport = (input.meta as Record<string, unknown>).sport;
    if (entries.length > 0 || mode !== 'equal' || (sport !== undefined && sport !== null)) {
      throw new ApiError('VALIDATION', 422, 'A fund-paid expense has no split');
    }
    // computeShares is skipped, so the amount gets its check here.
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
      throw validationError('amountInvalid', 'INVALID_AMOUNT');
    }
    // The request's payerId is ignored: the handler records the admin who wrote it.
    return { description, amount, spentOn, payerId, mode, shares: [], meta: { paidFromFund: true } };
  }

  const tripParticipants = await db
    .select()
    .from(participants)
    .where(
      and(
        eq(participants.tripId, tripId),
        inArray(participants.status, ['active', 'pending', 'left']),
      ),
    );

  const participantMap = new Map(
    tripParticipants.filter((p) => p.status !== 'left' || allowedLeftIds.has(p.id)).map((p) => [p.id, p]),
  );
  // Someone who left can't be put on an expense. Usually the form was opened before they left, so say so plainly.
  const leftIds = new Set(tripParticipants.filter((p) => !participantMap.has(p.id)).map((p) => p.id));
  const personLeft = () => new ApiError('PERSON_LEFT', 409, 'Someone on this expense has left the group.');

  if (!participantMap.has(payerId)) {
    if (leftIds.has(payerId)) throw personLeft();
    throw new ApiError('VALIDATION', 422, 'Invalid payer');
  }

  for (const entry of entries) {
    if (!participantMap.has(entry.participantId)) {
      if (leftIds.has(entry.participantId)) throw personLeft();
      throw new ApiError('VALIDATION', 422, 'Invalid participant in entries');
    }
  }

  const sortedEntries = [...entries].sort((a, b) => {
    const pA = participantMap.get(a.participantId);
    const pB = participantMap.get(b.participantId);
    return (pA?.sortOrder ?? 0) - (pB?.sortOrder ?? 0);
  });

  const rawMeta =
    input.meta && typeof input.meta === 'object' && !Array.isArray(input.meta)
      ? (input.meta as Record<string, unknown>)
      : null;
  if (input.meta !== undefined && input.meta !== null && !rawMeta) {
    throw new ApiError('VALIDATION', 422, 'Invalid meta');
  }

  const rawSport =
    rawMeta && rawMeta.sport && typeof rawMeta.sport === 'object' && !Array.isArray(rawMeta.sport)
      ? (rawMeta.sport as Record<string, unknown>)
      : null;
  if (rawMeta?.sport !== undefined && rawMeta?.sport !== null && !rawSport) {
    throw new ApiError('VALIDATION', 422, 'Invalid sport meta');
  }

  if (rawSport?.planning === true) {
    if (mode !== 'amounts') {
      throw new ApiError('VALIDATION', 422, 'Sport planning requires amounts mode');
    }
    if (!Number.isSafeInteger(amount) || amount !== 0) {
      throw new ApiError('VALIDATION', 422, 'INVALID_AMOUNT');
    }
    const court = rawSport.court ?? 0;
    if (!Number.isSafeInteger(court) || (court as number) < 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid court amount');
    }
    const extra = rawSport.extra ?? 0;
    if (!Number.isSafeInteger(extra) || (extra as number) < 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid extra amount');
    }
    const rawShuttlecocks = rawSport.shuttlecocks ?? [];
    if (!Array.isArray(rawShuttlecocks) || rawShuttlecocks.length > 5) {
      throw new ApiError('VALIDATION', 422, 'Invalid shuttlecocks');
    }
    for (const item of rawShuttlecocks) {
      if (!item || typeof item !== 'object') {
        throw new ApiError('VALIDATION', 422, 'Invalid shuttlecock item');
      }
      const { qty, unitPrice } = item as { qty: unknown; unitPrice: unknown };
      if (
        !Number.isSafeInteger(qty) ||
        (qty as number) < 0 ||
        !Number.isSafeInteger(unitPrice) ||
        (unitPrice as number) < 0
      ) {
        throw new ApiError('VALIDATION', 422, 'Invalid shuttlecock item values');
      }
    }
    const extended = validateSportExtended(rawSport);
    const rule = (rawSport.rule ?? { kind: 'equal' }) as SportRule;
    if (typeof rule !== 'object' || !rule) {
      throw new ApiError('VALIDATION', 422, 'Invalid sport rule');
    }
    if (rule.kind === 'equal') {
      // valid
    } else if (rule.kind === 'discount') {
      if (!Number.isSafeInteger(rule.femaleDiscount) || rule.femaleDiscount < 0) {
        throw new ApiError('VALIDATION', 422, 'Invalid female discount');
      }
    } else if (rule.kind === 'ratio') {
      if (
        !Number.isSafeInteger(rule.maleWeight) ||
        rule.maleWeight <= 0 ||
        !Number.isSafeInteger(rule.femaleWeight) ||
        rule.femaleWeight <= 0
      ) {
        throw new ApiError('VALIDATION', 422, 'Invalid ratio weights');
      }
    } else {
      throw new ApiError('VALIDATION', 422, 'Invalid sport rule');
    }
    if (!Array.isArray(rawSport.entries) || rawSport.entries.length === 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid sport entries');
    }
    if (rawSport.entries.length !== sortedEntries.length) {
      throw new ApiError('VALIDATION', 422, 'Sport entries participant count mismatch');
    }
    const sportEntryMap = new Map<string, SportParticipantEntry>();
    let totalMaleSlots = 0;
    let totalFemaleSlots = 0;
    for (const se of rawSport.entries) {
      if (!se || typeof se !== 'object') {
        throw new ApiError('VALIDATION', 422, 'Invalid sport entry');
      }
      const entry = se as Record<string, unknown>;
      const pid = entry.participantId;
      if (typeof pid !== 'string' || !participantMap.has(pid)) {
        throw new ApiError('VALIDATION', 422, 'Invalid participant in sport entries');
      }
      if (sportEntryMap.has(pid)) {
        throw new ApiError('VALIDATION', 422, 'Duplicate participant in sport entries');
      }
      if (
        !Number.isSafeInteger(entry.maleSlots) ||
        (entry.maleSlots as number) < 0 ||
        !Number.isSafeInteger(entry.femaleSlots) ||
        (entry.femaleSlots as number) < 0
      ) {
        throw new ApiError('VALIDATION', 422, 'Invalid slot numbers in sport entry');
      }
      const maleSlots = entry.maleSlots as number;
      const femaleSlots = entry.femaleSlots as number;
      totalMaleSlots += maleSlots;
      totalFemaleSlots += femaleSlots;
      sportEntryMap.set(pid, { participantId: pid, maleSlots, femaleSlots });
    }
    for (const e of sortedEntries) {
      if (!sportEntryMap.has(e.participantId)) {
        throw new ApiError('VALIDATION', 422, 'Sport entries do not match expense entries');
      }
    }
    if (totalMaleSlots + totalFemaleSlots <= 0) {
      throw new ApiError('VALIDATION', 422, 'Planning session requires at least one slot');
    }

    const shares = sortedEntries.map((sh) => ({
      participantId: sh.participantId,
      inputValue: 0,
      inputAuto: 0 as const,
      amount: 0,
    }));
    const sportMeta: ExpenseSportMeta = {
      planning: true,
      court: court as number,
      extra: extra as number,
      shuttlecocks: rawShuttlecocks as { qty: number; unitPrice: number }[],
      rule,
      entries: sortedEntries.map((e) => sportEntryMap.get(e.participantId)!),
      maleSlotRate: 0,
      femaleSlotRate: 0,
      ...extended,
    };
    return {
      description,
      amount: 0,
      spentOn,
      payerId,
      mode,
      shares,
      meta: { sport: sportMeta },
    };
  }

  const r = computeShares(amount, mode, sortedEntries);
  if (!r.ok) {
    throw new ApiError('VALIDATION', 422, r.error);
  }

  let meta: ExpenseMeta | null = null;
  if (rawSport) {
    if (mode !== 'amounts') {
      throw new ApiError('VALIDATION', 422, 'Sport meta requires amounts mode');
    }
    if (!Number.isSafeInteger(rawSport.court) || (rawSport.court as number) < 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid court amount');
    }
    if (!Number.isSafeInteger(rawSport.extra) || (rawSport.extra as number) < 0) {
      throw new ApiError('VALIDATION', 422, 'Invalid extra amount');
    }
    if (!Array.isArray(rawSport.shuttlecocks) || rawSport.shuttlecocks.length > 5) {
      throw new ApiError('VALIDATION', 422, 'Invalid shuttlecocks');
    }
    for (const item of rawSport.shuttlecocks) {
      if (!item || typeof item !== 'object') {
        throw new ApiError('VALIDATION', 422, 'Invalid shuttlecock item');
      }
      const { qty, unitPrice } = item as { qty: unknown; unitPrice: unknown };
      if (
        !Number.isSafeInteger(qty) ||
        (qty as number) < 0 ||
        !Number.isSafeInteger(unitPrice) ||
        (unitPrice as number) < 0
      ) {
        throw new ApiError('VALIDATION', 422, 'Invalid shuttlecock item values');
      }
    }
    const shuttlecockTotal = (rawSport.shuttlecocks as { qty: number; unitPrice: number }[]).reduce(
      (sum, item) => sum + item.qty * item.unitPrice,
      0,
    );
    if ((rawSport.court as number) + (rawSport.extra as number) + shuttlecockTotal !== amount) {
      throw new ApiError('VALIDATION', 422, 'Sport breakdown does not equal total amount');
    }

    const extended = validateSportExtended(rawSport);

    const sportRes = computeSportShares(
      amount,
      rawSport.rule as SportRule,
      rawSport.entries as SportParticipantEntry[],
    );
    if (!sportRes.ok) {
      throw new ApiError('VALIDATION', 422, sportRes.error);
    }
    if (
      sportRes.maleSlotRate !== rawSport.maleSlotRate ||
      sportRes.femaleSlotRate !== rawSport.femaleSlotRate
    ) {
      throw new ApiError('VALIDATION', 422, 'Sport slot rates mismatch');
    }
    if (sportRes.shares.length !== r.shares.length) {
      throw new ApiError('VALIDATION', 422, 'Sport shares length mismatch');
    }
    const rMap = new Map(r.shares.map((s) => [s.participantId, s.amount]));
    for (const s of sportRes.shares) {
      if (rMap.get(s.participantId) !== s.amount) {
        throw new ApiError('VALIDATION', 422, 'Sport shares mismatch with expense shares');
      }
    }
    meta = {
      sport: {
        court: rawSport.court as number,
        extra: rawSport.extra as number,
        shuttlecocks: rawSport.shuttlecocks as { qty: number; unitPrice: number }[],
        rule: rawSport.rule as SportRule,
        entries: rawSport.entries as SportParticipantEntry[],
        maleSlotRate: sportRes.maleSlotRate,
        femaleSlotRate: sportRes.femaleSlotRate,
        ...(rawSport.planning === false ? { planning: false } : {}),
        ...extended,
      },
    };
  } else if (rawMeta) {
    meta = rawMeta as ExpenseMeta;
  }

  const entryValueMap = new Map(sortedEntries.map((e) => [e.participantId, e.value]));
  const shares = r.shares.map((sh) => {
    const value = entryValueMap.get(sh.participantId);
    // A blank box is kept as automatic, so editing opens it blank and re-divides what is left.
    if (value === null) return { participantId: sh.participantId, inputValue: 0, inputAuto: 1 as const, amount: sh.amount };
    return { participantId: sh.participantId, inputValue: mode === 'equal' ? 1 : (value ?? 1), inputAuto: 0 as const, amount: sh.amount };
  });

  return {
    description,
    amount,
    spentOn,
    payerId,
    mode,
    shares,
    meta,
  };
}

/** Approving (or re-enabling) an expense that involves a name still waiting for approval is refused (spec §6.2). */
async function assertNoPendingPeople(db: Db, tripId: string, expenseId: string, payerId: string): Promise<void> {
  const pending = await db
    .select({ id: participants.id })
    .from(participants)
    .where(
      and(
        eq(participants.tripId, tripId),
        eq(participants.status, 'pending'),
        or(
          eq(participants.id, payerId),
          inArray(participants.id, db.select({ id: transactionShares.participantId }).from(transactionShares).where(eq(transactionShares.transactionId, expenseId))),
        ),
      ),
    )
    .limit(1);
  if (pending.length > 0) throw new ApiError('PERSON_PENDING', 409, 'Approve the new name first.');
}

/** Every write on a fund-paid expense needs a sport group and `manage_fund`, on top of the usual rules (spec §6.2). */
function ensureFundWrite(actor: ResolvedActor): void {
  assertSportGroup(actor.trip);
  ensure(actor, 'manage_fund');
}

/** A stored expense row as the fund sees it; `status` is the one it is about to take, if that differs. */
function fundItemOf(row: { amount: number; status: string; metaJson: string | null }, status = row.status): FundItem {
  return { kind: 'expense', amount: row.amount, status, meta: row.metaJson ? (JSON.parse(row.metaJson) as ExpenseMeta) : null };
}

/**
 * Writes an edit of `head`: supersedes it and inserts the new head with its shares. The supersede is
 * the guard, so a stale read (the head was approved, rejected or edited meanwhile) writes nothing and
 * throws `409 ALREADY_HANDLED`. Returns the new head's id.
 */
export async function writeExpenseEdit(
  db: Db,
  tripId: string,
  head: TransactionRow,
  validated: ValidatedExpense,
  actor: ResolvedActor,
  fundPaid: boolean,
): Promise<string> {
  const newHeadId = newId();
  const now = nowIso();

  const supersedeOld = db
    .update(transactions)
    .set({
      status: 'superseded',
      isLatest: 0,
      updatedAt: now,
    })
    .where(
      and(
        eq(transactions.id, head.id),
        eq(transactions.tripId, tripId),
        eq(transactions.isLatest, 1),
        eq(transactions.status, head.status),
      ),
    );

  const insertNewHead = db.insert(transactions).values({
    id: newHeadId,
    rootId: head.rootId,
    parentId: head.id,
    isLatest: 1,
    tripId,
    type: 'expense',
    description: validated.description,
    amount: validated.amount,
    amountConfirmed: null,
    currency: 'VND',
    spentOn: validated.spentOn,
    payerId: fundPaid ? actor.participantId! : validated.payerId,
    toId: null,
    splitMode: validated.mode,
    status: head.status,
    rejectReason: head.rejectReason,
    notArrivedAt: null,
    disabledByUserId: head.disabledByUserId,
    createdByParticipantId: actor.participantId!,
    createdByDevice: actor.deviceHash,
    confirmedByParticipantId: head.confirmedByParticipantId,
    metaJson: validated.meta ? JSON.stringify(validated.meta) : null,
    createdAt: now,
    updatedAt: now,
  });

  const insertShares = validated.shares.map((sh) =>
    db.insert(transactionShares).values({
      transactionId: newHeadId,
      participantId: sh.participantId,
      inputValue: sh.inputValue,
      inputAuto: sh.inputAuto,
      amount: sh.amount,
    }),
  );

  await guardedTripWrite(db, tripId, supersedeOld, [insertNewHead, ...insertShares], {
    action: 'expense_edited',
    actorParticipantId: actor.participantId,
    actorUserId: actor.userId,
    actorDevice: actor.deviceHash,
    details: {
      description: validated.description,
      amount: validated.amount,
      ...(fundPaid ? { paidFromFund: true } : {}),
    },
  });

  return newHeadId;
}

export function expenseRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  // POST /trips/:id/expenses
  app.post('/trips/:id/expenses', async (c) => {
    const tripId = c.req.param('id');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);
    ensure(actor, 'add_expense');

    const participantId = actor.participantId;
    if (!participantId) {
      throw new ApiError('FORBIDDEN', 403, 'Pick your name first.');
    }

    const db = getDb(c.env);

    if (actor.kind === 'guest') {
      const pendingCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.tripId, tripId),
            eq(transactions.type, 'expense'),
            eq(transactions.isLatest, 1),
            eq(transactions.status, 'pending'),
          ),
        )
        .get();

      if ((pendingCount?.count ?? 0) >= 50) {
        throw new ApiError('RATE_LIMITED', 429);
      }
    }

    const body = await parseJson<ExpenseInput>(c);
    const validated = await validateExpenseInput(db, tripId, body, new Set());
    const fundPaid = isFundPaid(validated);
    if (fundPaid) ensureFundWrite(actor);
    if (isPlanningExpense(validated)) {
      ensure(actor, 'plan_session');
    }

    const status = initialExpenseStatus(actor);
    if (fundPaid) {
      const after: FundItem = { kind: 'expense', amount: validated.amount, status, meta: validated.meta };
      assertFundCovers(await currentFundBalance(db, tripId), null, after);
    }
    const expenseId = newId();
    const now = nowIso();

    const insertExpense = db.insert(transactions).values({
      id: expenseId,
      rootId: expenseId,
      parentId: null,
      isLatest: 1,
      tripId,
      type: 'expense',
      description: validated.description,
      amount: validated.amount,
      amountConfirmed: null,
      currency: 'VND',
      spentOn: validated.spentOn,
      // Nobody paid a fund-paid expense personally; the column holds the admin who recorded it.
      payerId: fundPaid ? participantId : validated.payerId,
      toId: null,
      splitMode: validated.mode,
      status,
      rejectReason: null,
      notArrivedAt: null,
      disabledByUserId: null,
      createdByParticipantId: participantId,
      createdByDevice: actor.deviceHash,
      confirmedByParticipantId: null,
      metaJson: validated.meta ? JSON.stringify(validated.meta) : null,
      createdAt: now,
      updatedAt: now,
    });

    const insertShares = validated.shares.map((sh) =>
      db.insert(transactionShares).values({
        transactionId: expenseId,
        participantId: sh.participantId,
        inputValue: sh.inputValue,
        inputAuto: sh.inputAuto,
        amount: sh.amount,
      }),
    );

    await commitTripWrite(db, tripId, [insertExpense, ...insertShares], {
      action: 'expense_added',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {
        description: validated.description,
        amount: validated.amount,
        ...(fundPaid ? { paidFromFund: true } : {}),
      },
    });

    // A new plan or direct sport bill counts every finished session not yet counted (excluding the
    // direct bill just created). Bookkeeping only: it must never fail the request.
    if (actor.trip.preset === 'sport' && validated.meta?.sport) {
      try {
        await countPendingSessions(
          db,
          tripId,
          isPlanningExpense(validated) ? undefined : [expenseId],
        );
      } catch (err) {
        console.warn('Attendance counting failed', safeError(err));
      }
    }

    if (isPlanningExpense(validated)) {
      await dispatchSessionPush(c, expenseId, null, {
        actorUserId: actor.userId,
        actorParticipantId: actor.participantId,
      });
    } else if (status === 'approved') {
      await dispatchExpenseNotification(c, 'approved', expenseId, {
        actorUserId: actor.userId,
        actorParticipantId: actor.participantId,
      });
      await dispatchExpensePush(c, expenseId, {
        actorUserId: actor.userId,
        actorParticipantId: actor.participantId,
      });
    }

    return c.json({ expenseId }, 201);
  });

  // PATCH /trips/:id/expenses/:eid
  app.patch('/trips/:id/expenses/:eid', async (c) => {
    const tripId = c.req.param('id');
    const eid = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, eid), eq(transactions.rootId, eid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const headItem = fundItemOf(head);
    if (isFundPaid(headItem)) ensureFundWrite(actor);

    ensure(actor, 'edit_expense', {
      expenseCreatedById: head.createdByParticipantId,
      expenseStatus: head.status as ExpenseStatus,
      isPlanning: isPlanningExpense(headItem),
    });

    const body = await parseJson<ExpenseInput>(c);
    const currentShares = await db
      .select({ participantId: transactionShares.participantId })
      .from(transactionShares)
      .where(eq(transactionShares.transactionId, head.id));
    const onExpense = new Set([head.payerId, ...currentShares.map((s) => s.participantId)]);
    const validated = await validateExpenseInput(db, tripId, body, onExpense);
    const fundPaid = isFundPaid(validated);
    if (fundPaid) ensureFundWrite(actor);
    if (isPlanningExpense(validated)) {
      ensure(actor, 'plan_session');
    }
    // The new version keeps the head's status, and fund-paid expenses are never pending (spec §3).
    if (fundPaid && head.status === 'pending') {
      throw validationError('pendingFromFund', 'A pending expense cannot be paid from the group fund.');
    }

    // The expense's own amount is available again, so editing it within that is fine (spec §9.2).
    if (fundPaid || isFundPaid(headItem)) {
      const after: FundItem = { kind: 'expense', amount: validated.amount, status: head.status, meta: validated.meta };
      assertFundCovers(await currentFundBalance(db, tripId), headItem, after);
    }

    const before = sessionSnapshotOf(head);
    const newHeadId = await writeExpenseEdit(db, tripId, head, validated, actor, fundPaid);
    const actorArgs = {
      actorUserId: actor.userId,
      actorParticipantId: actor.participantId,
    };

    if (before.live || isPlanningExpense(validated)) {
      await dispatchSessionPush(c, head.rootId, before, actorArgs);
    }

    if (isPlanningExpense(validated)) {
      // Skip notification while in planning mode
    } else if (isPlanningExpense(headItem)) {
      if (head.status === 'approved') {
        await dispatchExpenseNotification(c, 'approved', head.rootId, actorArgs);
        await dispatchExpensePush(c, head.rootId, actorArgs);
      }
    } else {
      await dispatchExpenseNotification(c, 'updated', head.rootId, actorArgs);
    }

    return c.json({ expenseId: newHeadId, rootId: head.rootId }, 200);
  });

  // POST /trips/:id/expenses/:eid/rollback
  app.post('/trips/:id/expenses/:eid/rollback', async (c) => {
    const tripId = c.req.param('id');
    const eid = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, eid), eq(transactions.rootId, eid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const headItem = fundItemOf(head);
    if (isFundPaid(headItem)) ensureFundWrite(actor);

    ensure(actor, 'edit_expense', {
      expenseCreatedById: head.createdByParticipantId,
      expenseStatus: head.status as ExpenseStatus,
      isPlanning: isPlanningExpense(headItem),
    });

    const body = await parseJson<{ targetHistoryId?: unknown }>(c);
    if (!body || typeof body.targetHistoryId !== 'string') {
      throw new ApiError('VALIDATION', 422, 'Invalid targetHistoryId');
    }
    const targetHistoryId = body.targetHistoryId;

    const targetRow = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.id, targetHistoryId),
          eq(transactions.rootId, head.rootId),
          eq(transactions.isLatest, 0),
        ),
      )
      .get();

    if (!targetRow) {
      throw new ApiError('NOT_FOUND', 404, 'Historical version not found');
    }

    // The new latest copies the target (its meta included) but keeps the current status.
    const targetItem = fundItemOf(targetRow, head.status);
    if (isPlanningExpense(targetItem)) ensure(actor, 'plan_session');
    if (isFundPaid(targetItem)) ensureFundWrite(actor);
    if (isFundPaid(targetItem) && head.status === 'pending') {
      throw validationError('pendingFromFund', 'A pending expense cannot be paid from the group fund.');
    }
    if (isFundPaid(headItem) || isFundPaid(targetItem)) {
      assertFundCovers(await currentFundBalance(db, tripId), headItem, targetItem);
    }

    const targetShares = await db
      .select()
      .from(transactionShares)
      .where(eq(transactionShares.transactionId, targetHistoryId));

    const newHeadId = newId();
    const now = nowIso();

    const supersedeOld = db
      .update(transactions)
      .set({
        status: 'superseded',
        isLatest: 0,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
          eq(transactions.status, head.status),
        ),
      );

    const insertNewHead = db.insert(transactions).values({
      id: newHeadId,
      rootId: head.rootId,
      parentId: head.id,
      isLatest: 1,
      tripId,
      type: 'expense',
      description: targetRow.description,
      amount: targetRow.amount,
      amountConfirmed: null,
      currency: targetRow.currency,
      spentOn: targetRow.spentOn,
      payerId: targetRow.payerId,
      toId: null,
      splitMode: targetRow.splitMode,
      status: head.status,
      rejectReason: head.rejectReason,
      notArrivedAt: null,
      disabledByUserId: head.disabledByUserId,
      createdByParticipantId: actor.participantId!,
      createdByDevice: actor.deviceHash,
      confirmedByParticipantId: head.confirmedByParticipantId,
      metaJson: targetRow.metaJson,
      createdAt: now,
      updatedAt: now,
    });

    const insertNewShares = targetShares.map((sh) =>
      db.insert(transactionShares).values({
        transactionId: newHeadId,
        participantId: sh.participantId,
        inputValue: sh.inputValue,
        inputAuto: sh.inputAuto,
        amount: sh.amount,
      }),
    );

    const before = sessionSnapshotOf(head);

    await guardedTripWrite(db, tripId, supersedeOld, [insertNewHead, ...insertNewShares], {
      action: 'expense_rolled_back',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {
        description: targetRow.description,
        amount: targetRow.amount,
        targetHistoryId,
      },
    });

    if (before.live || isPlanningExpense(targetItem)) {
      await dispatchSessionPush(c, head.rootId, before, {
        actorUserId: actor.userId,
        actorParticipantId: actor.participantId,
      });
    }

    return c.json({ expenseId: newHeadId, rootId: head.rootId }, 200);
  });

  // DELETE /trips/:id/expenses/:eid
  app.delete('/trips/:id/expenses/:eid', async (c) => {
    const tripId = c.req.param('id');
    const eid = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, eid), eq(transactions.rootId, eid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const headItem = fundItemOf(head);
    // Deleting only returns money to the fund, so it needs no fund check.
    if (isFundPaid(headItem)) ensureFundWrite(actor);

    ensure(actor, 'delete_expense', {
      expenseCreatedById: head.createdByParticipantId,
      expenseStatus: head.status as ExpenseStatus,
      isPlanning: isPlanningExpense(headItem),
    });

    // Touches the head only if it is still the one read (same status, still latest), so a delete
    // racing an approval or an edit writes nothing and gets 409 ALREADY_HANDLED.
    const headUnchanged = db
      .update(transactions)
      .set({ updatedAt: nowIso() })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
          eq(transactions.status, head.status),
        ),
      );

    const rootTxIds = db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.tripId, tripId), eq(transactions.rootId, head.rootId)));

    const deleteShares = db
      .delete(transactionShares)
      .where(inArray(transactionShares.transactionId, rootTxIds));

    const deleteTransactions = db
      .delete(transactions)
      .where(and(eq(transactions.tripId, tripId), eq(transactions.rootId, head.rootId)));

    const before = sessionSnapshotOf(head);

    await guardedTripWrite(db, tripId, headUnchanged, [deleteShares, deleteTransactions], {
      action: 'expense_deleted',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {
        description: head.description,
        amount: head.amount,
        payerId: head.payerId,
        spentOn: head.spentOn,
        status: head.status,
      },
    });

    if (before.live) {
      await dispatchSessionPush(c, head.rootId, before, {
        actorUserId: actor.userId,
        actorParticipantId: actor.participantId,
      });
    }

    return c.body(null, 204);
  });

async function isExpenseInvolved(db: Db, eid: string, payerId: string, participantId: string | null): Promise<boolean> {
  if (participantId === null) return false;
  if (payerId === participantId) return true;
  const share = await db
    .select({ participantId: transactionShares.participantId })
    .from(transactionShares)
    .where(
      and(
        eq(transactionShares.transactionId, eid),
        eq(transactionShares.participantId, participantId),
      ),
    )
    .get();
  return Boolean(share);
}

  // POST /trips/:id/expenses/:eid/approve
  app.post('/trips/:id/expenses/:eid/approve', async (c) => {
    const tripId = c.req.param('id');
    const eid = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, eid), eq(transactions.rootId, eid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    // Fund-paid expenses are never pending now, but older data could hold one: approving it spends from the fund.
    const headItem = fundItemOf(head);
    if (isFundPaid(headItem)) ensureFundWrite(actor);

    const expenseInvolved = await isExpenseInvolved(db, head.id, head.payerId, actor.participantId);
    ensure(actor, 'approve_expense', { expenseInvolved });

    if (head.status !== 'pending') {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    await assertNoPendingPeople(db, tripId, head.id, head.payerId);
    if (isFundPaid(headItem)) {
      assertFundCovers(await currentFundBalance(db, tripId), null, fundItemOf(head, 'approved'));
    }

    const now = nowIso();
    const guard = db
      .update(transactions)
      .set({ status: 'approved', updatedAt: now })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
          eq(transactions.status, 'pending'),
        ),
      );

    await guardedTripWrite(db, tripId, guard, [], {
      action: 'expense_approved',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { description: head.description },
    });

    await dispatchExpenseNotification(c, 'approved', head.rootId, {
      actorUserId: actor.userId,
      actorParticipantId: actor.participantId,
    });
    await dispatchExpensePush(c, head.rootId, {
      actorUserId: actor.userId,
      actorParticipantId: actor.participantId,
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/expenses/:eid/reject
  app.post('/trips/:id/expenses/:eid/reject', async (c) => {
    const tripId = c.req.param('id');
    const eid = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, eid), eq(transactions.rootId, eid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const expenseInvolved = await isExpenseInvolved(db, head.id, head.payerId, actor.participantId);
    ensure(actor, 'approve_expense', { expenseInvolved });

    if (head.status !== 'pending') {
      throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
    }

    const body = await parseJson<{ reason?: unknown }>(c);
    if (typeof body?.reason !== 'string') {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }

    const reason = body.reason.trim();
    if (reason.length < 1 || reason.length > 140) {
      throw validationError('reasonLength', 'Reason must be 1 to 140 characters');
    }

    const now = nowIso();
    const guard = db
      .update(transactions)
      .set({ status: 'rejected', rejectReason: reason, updatedAt: now })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
          eq(transactions.status, 'pending'),
        ),
      );

    await guardedTripWrite(db, tripId, guard, [], {
      action: 'expense_rejected',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: { description: head.description, reason },
    });

    await dispatchExpenseNotification(c, 'deleted', head.rootId, {
      actorUserId: actor.userId,
      actorParticipantId: actor.participantId,
    });

    return c.body(null, 204);
  });

  // POST /trips/:id/expenses/:eid/disable
  app.post('/trips/:id/expenses/:eid/disable', async (c) => {
    const tripId = c.req.param('id');
    const eid = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, eid), eq(transactions.rootId, eid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    // Disabling only returns money to the fund, so it needs no fund check.
    if (isFundPaid(fundItemOf(head))) ensureFundWrite(actor);

    const expenseInvolved = await isExpenseInvolved(db, head.id, head.payerId, actor.participantId);
    ensure(actor, 'disable', { expenseInvolved });

    const before = sessionSnapshotOf(head);
    const now = nowIso();
    const guard = db
      .update(transactions)
      .set({
        status: 'disabled',
        disabledByUserId: actor.userId,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
          inArray(transactions.status, ['approved', 'pending']),
        ),
      );

    await guardedTripWrite(db, tripId, guard, [], {
      action: 'expense_disabled',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {},
    });

    await dispatchExpenseNotification(c, 'deleted', head.rootId, {
      actorUserId: actor.userId,
      actorParticipantId: actor.participantId,
    });
    if (before.live || isPlanningExpense(fundItemOf(head))) {
      await dispatchSessionPush(c, head.rootId, before, {
        actorUserId: actor.userId,
        actorParticipantId: actor.participantId,
      });
    }

    return c.body(null, 204);
  });

  // POST /trips/:id/expenses/:eid/enable
  app.post('/trips/:id/expenses/:eid/enable', async (c) => {
    const tripId = c.req.param('id');
    const eid = c.req.param('eid');
    const actor = await resolveActor(c, tripId);
    assertWritable(actor.trip);

    const db = getDb(c.env);
    const head = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          eq(transactions.type, 'expense'),
          eq(transactions.isLatest, 1),
          or(eq(transactions.id, eid), eq(transactions.rootId, eid)),
        ),
      )
      .get();

    if (!head) {
      throw new ApiError('NOT_FOUND', 404);
    }

    const headItem = fundItemOf(head);
    if (isFundPaid(headItem)) ensureFundWrite(actor);

    const expenseInvolved = await isExpenseInvolved(db, head.id, head.payerId, actor.participantId);
    ensure(actor, 'disable', { expenseInvolved });

    if (head.status === 'disabled') await assertNoPendingPeople(db, tripId, head.id, head.payerId);
    // Enabling spends from the fund again, so it is checked like a new one (spec §9.3).
    if (head.status === 'disabled' && isFundPaid(headItem)) {
      assertFundCovers(await currentFundBalance(db, tripId), null, fundItemOf(head, 'approved'));
    }

    const before = sessionSnapshotOf(head);
    const now = nowIso();
    const guard = db
      .update(transactions)
      .set({
        status: 'approved',
        disabledByUserId: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(transactions.id, head.id),
          eq(transactions.tripId, tripId),
          eq(transactions.isLatest, 1),
          eq(transactions.status, 'disabled'),
        ),
      );

    await guardedTripWrite(db, tripId, guard, [], {
      action: 'expense_enabled',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: {},
    });

    if (before.live || isPlanningExpense(headItem)) {
      await dispatchSessionPush(c, head.rootId, before, {
        actorUserId: actor.userId,
        actorParticipantId: actor.participantId,
      });
    }

    return c.body(null, 204);
  });

  return app;
}
