import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PersonKey, ProposalView, ProposalsResponse } from '@cc/core';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import { mergeProposals, participants, trips } from '@cc/api-db/schema';
import { getSessionUser, requireUser } from '../auth/session';
import { assertWritable, resolveActor } from '../access/actor';
import { ensure } from '../access/guard';
import { commitTripWrite } from '@cc/api-db/commit';
import { ApiError } from '@cc/api-util/errors';
import { nowIso } from '@cc/api-util/ids';
import { completeIfReady, type ProposalRow } from './store';

/** Outgoing proposals stay listed this long after they are decided. */
const DECIDED_SHOWN_MS = 7 * 24 * 60 * 60 * 1000;

const alreadyHandled = () => new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');

interface ListRow {
  id: string;
  trip_id: string;
  trip_name: string;
  preset: string;
  guest_pid: string;
  guest_name: string;
  guest_user_id: string | null;
  link_pid: string | null;
  link_user_id: string | null;
  requested_by_name: string | null;
  target_name: string | null;
  needs_user: number;
  needs_admin: number;
  user_accepted_at: string | null;
  admin_accepted_at: string | null;
  status: ProposalView['status'];
}

function toView(r: ListRow, me: string): ProposalView {
  // The caller's people key for the guest, as canonicalKey would give it (without its access check).
  let guestKey: PersonKey = `p:${r.link_pid ?? r.guest_pid}`;
  if (r.guest_user_id && r.guest_user_id !== me) guestKey = `u:${r.guest_user_id}`;
  else if (r.link_user_id && r.link_user_id !== me) guestKey = `u:${r.link_user_id}`;
  const waitingFor: ProposalView['waitingFor'] = [];
  if (r.status === 'pending' && r.needs_user && !r.user_accepted_at) waitingFor.push('user');
  if (r.status === 'pending' && r.needs_admin && !r.admin_accepted_at) waitingFor.push('admin');
  return {
    id: r.id,
    tripId: r.trip_id,
    tripName: r.trip_name,
    tripKind: r.preset === 'direct' ? 'direct' : 'group',
    guestName: r.guest_name,
    guestKey,
    requestedByName: r.requested_by_name ?? '',
    targetUserName: r.target_name,
    waitingFor,
    status: r.status,
  };
}

/** Both lists in one query. */
async function listProposals(db: Db, me: string): Promise<ProposalsResponse> {
  const since = new Date(Date.now() - DECIDED_SHOWN_MS).toISOString();
  const rows = await db.all<ListRow & { incoming: number; outgoing: number }>(sql`
    SELECT mp.id, mp.trip_id, t.name AS trip_name, t.preset, mp.guest_pid, g.name AS guest_name,
      g.user_id AS guest_user_id, pl.person_pid AS link_pid, lt.user_id AS link_user_id,
      ru.name AS requested_by_name, tu.name AS target_name, mp.needs_user, mp.needs_admin,
      mp.user_accepted_at, mp.admin_accepted_at, mp.status,
      (mp.target_user_id = ${me} AND mp.status = 'pending') AS incoming,
      (mp.requested_by_user_id = ${me} AND (mp.status = 'pending' OR mp.decided_at >= ${since})) AS outgoing
    FROM merge_proposals mp
    JOIN trips t ON t.id = mp.trip_id
    JOIN participants g ON g.id = mp.guest_pid
    LEFT JOIN users ru ON ru.id = mp.requested_by_user_id
    LEFT JOIN users tu ON tu.id = mp.target_user_id
    LEFT JOIN person_links pl ON pl.owner_user_id = ${me} AND pl.participant_id = mp.guest_pid
    LEFT JOIN participants lt ON lt.id = pl.person_pid
    WHERE (mp.target_user_id = ${me} AND mp.status = 'pending')
       OR (mp.requested_by_user_id = ${me} AND (mp.status = 'pending' OR mp.decided_at >= ${since}))
    ORDER BY mp.created_at, mp.id`);
  const out: ProposalsResponse = { incoming: [], outgoing: [] };
  for (const r of rows) {
    if (r.incoming) out.incoming.push(toView(r, me));
    if (r.outgoing) out.outgoing.push(toView(r, me));
  }
  return out;
}

async function loadProposal(db: Db, id: string): Promise<ProposalRow> {
  const row = await db.select().from(mergeProposals).where(eq(mergeProposals.id, id)).get();
  if (!row) throw new ApiError('NOT_FOUND', 404);
  return row;
}

/** The proposal's trip, refusing writes when it is archived. */
async function writableTrip(db: Db, tripId: string) {
  const trip = await db.select().from(trips).where(eq(trips.id, tripId)).get();
  if (!trip) throw new ApiError('NOT_FOUND', 404);
  assertWritable(trip);
  return trip;
}

/** The user's active participant in the trip, if any (a friend may not be in it yet). */
async function myPid(db: Db, tripId: string, userId: string): Promise<string | null> {
  const row = await db
    .select({ id: participants.id })
    .from(participants)
    .where(and(eq(participants.tripId, tripId), eq(participants.userId, userId), eq(participants.status, 'active')))
    .get();
  return row?.id ?? null;
}

/** Sets status (declined/cancelled) on a pending proposal; 0 changes → ALREADY_HANDLED. */
async function decide(db: Db, id: string, status: 'declined' | 'cancelled', extra = sql`1 = 1`): Promise<void> {
  const r = await db
    .update(mergeProposals)
    .set({ status, decidedAt: nowIso() })
    .where(and(eq(mergeProposals.id, id), eq(mergeProposals.status, 'pending'), extra))
    .run();
  if (r.meta.changes === 0) throw alreadyHandled();
}

const declinedLog = (row: ProposalRow, side: 'user' | 'admin') => ({
  proposalId: row.id,
  participantId: row.guestPid,
  side,
});

export function proposalRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/proposals', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    return c.json(await listProposals(getDb(c.env), user.id));
  });

  /** The friend's side: only the user the proposal names. */
  const asTarget = async (c: Context<AppBindings>) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);
    const row = await loadProposal(db, c.req.param('id')!);
    if (row.targetUserId !== user.id) throw new ApiError('FORBIDDEN', 403);
    await writableTrip(db, row.tripId);
    const actor = { participantId: await myPid(db, row.tripId, user.id), userId: user.id, deviceHash: c.get('deviceHash') ?? null };
    return { db, row, actor };
  };

  app.post('/me/proposals/:id/accept', requireUser, async (c) => {
    const { db, row, actor } = await asTarget(c);
    const r = await db
      .update(mergeProposals)
      .set({ userAcceptedAt: nowIso() })
      .where(
        and(
          eq(mergeProposals.id, row.id),
          eq(mergeProposals.status, 'pending'),
          eq(mergeProposals.needsUser, 1),
          isNull(mergeProposals.userAcceptedAt),
        ),
      )
      .run();
    if (r.meta.changes === 0) throw alreadyHandled();
    return c.json({ status: await completeIfReady(db, row.id, actor) });
  });

  app.post('/me/proposals/:id/decline', requireUser, async (c) => {
    const { db, row, actor } = await asTarget(c);
    await decide(db, row.id, 'declined');
    await commitTripWrite(db, row.tripId, [], {
      action: 'merge_proposal_declined',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: declinedLog(row, 'user'),
    });
    return c.body(null, 204);
  });

  app.post('/me/proposals/:id/cancel', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const db = getDb(c.env);
    const row = await loadProposal(db, c.req.param('id'));
    if (row.requestedByUserId !== user.id) throw new ApiError('FORBIDDEN', 403);
    await writableTrip(db, row.tripId);
    await decide(db, row.id, 'cancelled');
    return c.body(null, 204);
  });

  /** The admin's side: an admin of the proposal's trip, for a proposal that needs one. */
  const asAdmin = async (c: Context<AppBindings>) => {
    const tripId = c.req.param('id')!;
    const actor = await resolveActor(c, tripId);
    if (actor.kind === 'viewer') throw new ApiError('FORBIDDEN', 403);
    assertWritable(actor.trip);
    ensure(actor, 'approve');
    const db = getDb(c.env);
    const row = await loadProposal(db, c.req.param('pid')!);
    if (row.tripId !== tripId) throw new ApiError('NOT_FOUND', 404);
    return { db, row, actor };
  };

  app.post('/trips/:id/proposals/:pid/approve', async (c) => {
    const { db, row, actor } = await asAdmin(c);
    const r = await db
      .update(mergeProposals)
      .set({ adminAcceptedAt: nowIso() })
      .where(
        and(
          eq(mergeProposals.id, row.id),
          eq(mergeProposals.status, 'pending'),
          eq(mergeProposals.needsAdmin, 1),
          isNull(mergeProposals.adminAcceptedAt),
        ),
      )
      .run();
    if (r.meta.changes === 0) throw alreadyHandled();
    return c.json({ status: await completeIfReady(db, row.id, actor) });
  });

  app.post('/trips/:id/proposals/:pid/reject', async (c) => {
    const { db, row, actor } = await asAdmin(c);
    await decide(db, row.id, 'declined', sql`${mergeProposals.needsAdmin} = 1`);
    await commitTripWrite(db, row.tripId, [], {
      action: 'merge_proposal_declined',
      actorParticipantId: actor.participantId,
      actorUserId: actor.userId,
      actorDevice: actor.deviceHash,
      details: declinedLog(row, 'admin'),
    });
    return c.body(null, 204);
  });

  return app;
}
