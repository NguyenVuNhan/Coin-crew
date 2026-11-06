import type { Context } from 'hono';
import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import {
  findSimilarNames,
  planMerge,
  type MergeCandidate,
  type MergeGroupRef,
  type MergeOptionsResponse,
  type MergePlan,
  type MergePlanContext,
  type MergeSide,
  type PersonKey,
} from '@cc/core';
import type { AppBindings } from '@cc/api-db/env';
import { getDb, type Db } from '@cc/api-db/client';
import { personLinks } from '@cc/api-db/schema';
import { getSessionUser, requireUser } from '@cc/api-auth/session';
import { assertWritable, resolveActor } from '@cc/api-auth/actor';
import { ensure } from '@cc/api-auth/guard';
import { commitTripWrite } from '@cc/api-db/commit';
import { ApiError } from '@cc/api-util/errors';
import { mergeParticipants } from '../participants/merge';
import { insertProposal } from '../proposals/store';
import { loadPeopleIndex, type OtherRow, type PeopleIndex, type PeoplePlace } from './balances';
import { linkGuests, parseLinkKeys } from './personRoutes';

function parseKey(raw: string): PersonKey {
  if (/^[up]:.+$/.test(raw)) return raw as PersonKey;
  throw new ApiError('NOT_FOUND', 404);
}

const byTripName = (a: PeoplePlace, b: PeoplePlace) => a.tripName.localeCompare(b.tripName) || a.tripId.localeCompare(b.tripId);

/** One entry per trip, A–Z. */
function groupRefs(places: PeoplePlace[]): MergeGroupRef[] {
  const seen = new Set<string>();
  const out: MergeGroupRef[] = [];
  for (const p of [...places].sort(byTripName)) {
    if (seen.has(p.tripId)) continue;
    seen.add(p.tripId);
    out.push({ tripId: p.tripId, tripName: p.tripName, kind: p.kind });
  }
  return out;
}

function signInOf(row: OtherRow | undefined): MergeCandidate['signIn'] {
  if (!row) return null;
  if (row.user_google_sub && row.user_email) return { provider: 'google', label: row.user_email };
  if (row.user_zalo_sub) return { provider: 'zalo', label: row.user_zalo_name ?? 'Zalo' };
  return null;
}

/**
 * The person page's "Merge with…" picker: the person's places, and everyone else the caller shares
 * a group or ledger with, each with the plan a pick would run. Six fixed statements: the people
 * index (four) plus pending claims and pending proposals over the caller's trips.
 * Returns null when the key is not someone the caller shares a group or ledger with.
 */
export async function loadMergeOptions(db: Db, userId: string, rawKey: PersonKey): Promise<MergeOptionsResponse | null> {
  const { index, ctx } = await loadPlanInputs(db, userId);
  const key = rawKey.startsWith('p:') ? index.keyOfPid.get(rawKey.slice(2)) : rawKey;
  const person = key ? index.people.get(key) : undefined;
  if (!key || !person) return null;

  // Accounts that are active in one of the caller's active groups (ledgers don't count).
  const activeGroups = new Set(
    index.mine.filter((r) => r.trip.archivedAt === null && r.trip.preset !== 'direct').map((r) => r.trip.id),
  );
  const sharesGroup = new Set<string>();
  const accountRow = new Map<string, OtherRow>();
  for (const o of index.byPid.values()) {
    if (!o.user_id) continue;
    accountRow.set(o.user_id, o);
    if (o.status === 'active' && activeGroups.has(o.trip_id)) sharesGroup.add(o.user_id);
  }

  const side = { key, userId: person.userId, places: person.places };
  const candidates: MergeCandidate[] = [];
  for (const [otherKey, other] of index.people) {
    if (otherKey === key) continue;
    const account = other.userId ? accountRow.get(other.userId) : undefined;
    candidates.push({
      key: otherKey,
      name: other.name,
      nickname: index.nicknameOf.get(otherKey) ?? null,
      avatarUrl: account?.user_avatar_url ?? null,
      signIn: other.userId && sharesGroup.has(other.userId) ? signInOf(account) : null,
      groups: groupRefs(other.places),
      similar: false,
      plan: planMerge(side, { key: otherKey, userId: other.userId, places: other.places }, ctx),
    });
  }

  const similar = findSimilarNames(person.name, candidates.map((c) => ({ id: c.key, name: c.name })));
  const rank = new Map(similar.map((s, i) => [s.id, i]));
  for (const c of candidates) c.similar = rank.has(c.key);
  candidates.sort((a, b) => {
    const ra = rank.get(a.key);
    const rb = rank.get(b.key);
    if (ra !== undefined || rb !== undefined) return (ra ?? Infinity) - (rb ?? Infinity);
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.key.localeCompare(b.key);
  });

  return {
    person: {
      key,
      groups: [...person.places].sort(byTripName).map((p) => ({
        tripId: p.tripId,
        tripName: p.tripName,
        kind: p.kind,
        participantId: p.participantId,
        name: p.name,
        // Only a group's admin renames its guests, and an archived group can't change.
        canRename: p.userId === null && index.adminTripIds.has(p.tripId) && !p.archived,
      })),
    },
    candidates,
  };
}

/** The people index plus the pending claims and proposals over the caller's trips (six statements). */
async function loadPlanInputs(db: Db, userId: string): Promise<{ index: PeopleIndex; ctx: MergePlanContext }> {
  const myTrips = sql`SELECT m.trip_id FROM participants m WHERE m.user_id = ${userId} AND m.status = 'active'`;
  const [index, claims, proposals] = await Promise.all([
    loadPeopleIndex(db, userId),
    db.all<{ participant_id: string; user_id: string }>(sql`
      SELECT r.participant_id AS participant_id, r.user_id AS user_id FROM membership_requests r
      WHERE r.status = 'pending' AND r.trip_id IN (${myTrips})
    `),
    db.all<{ guest_pid: string }>(sql`
      SELECT mp.guest_pid AS guest_pid FROM merge_proposals mp
      WHERE mp.status = 'pending' AND mp.trip_id IN (${myTrips})
    `),
  ]);

  const ctx: MergePlanContext = {
    adminTripIds: index.adminTripIds,
    pendingClaims: new Map(claims.map((c) => [c.participant_id, c.user_id])),
    pendingProposals: new Set(proposals.map((p) => p.guest_pid)),
  };
  return { index, ctx };
}

/** The person behind a key as the people index sees it now; the key it came under may be stale. */
function sideOf(index: PeopleIndex, raw: PersonKey): MergeSide {
  const pid = raw.startsWith('p:') ? raw.slice(2) : null;
  const key = pid ? index.keyOfPid.get(pid) : raw;
  const person = key ? index.people.get(key) : undefined;
  if (key && person) return { key, userId: person.userId, places: person.places };
  // A guest the caller could see, merged away since the picker loaded.
  if (pid && index.byPid.has(pid)) throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
  throw new ApiError('NOT_FOUND', 404);
}

function blocked(plan: Extract<MergePlan, { ok: false }>): ApiError {
  if (plan.block.reason === 'both_signed_in') return new ApiError('BOTH_SIGNED_IN', 409, 'Both have accounts');
  return new ApiError('ALREADY_CLAIMED', 409, 'Someone already asked about this person');
}

function parseMergeKeys(raw: unknown): [PersonKey, PersonKey] {
  if (!Array.isArray(raw) || raw.length !== 2) throw new ApiError('VALIDATION', 422, 'Pick two people');
  for (const k of raw) {
    if (typeof k !== 'string' || !/^[up]:.+$/.test(k)) throw new ApiError('VALIDATION', 422, 'Invalid person');
  }
  if (raw[0] === raw[1]) throw new ApiError('VALIDATION', 422, 'Pick different people');
  return [raw[0] as PersonKey, raw[1] as PersonKey];
}

/**
 * Runs the plan for merging B (`keys[1]`) into A (`keys[0]`), re-planned from the database (the
 * client's plan is never trusted). Everything is checked before the first write, so a blocked or
 * stale pick writes nothing. Then: each request, the view-only link, each group merge. Returns A's
 * key after the steps and the ids of the requests made.
 */
async function executeMerge(c: Context<AppBindings>, user: { id: string; name: string }, keys: [PersonKey, PersonKey]): Promise<{ key: PersonKey; proposals: string[] }> {
  const db = getDb(c.env);
  const device = c.get('deviceHash') ?? null;
  const { index, ctx } = await loadPlanInputs(db, user.id);
  const a = sideOf(index, keys[0]);
  const b = sideOf(index, keys[1]);
  // Two keys for one person: an earlier link or merge already made them one.
  if (a.key === b.key) throw new ApiError('ALREADY_HANDLED', 409, 'Someone already handled this.');
  const plan = planMerge(a, b, ctx);
  if (!plan.ok) throw blocked(plan);

  // Requests first: their pids don't depend on the link or the merges, so a request that loses
  // a race (ALREADY_CLAIMED) leaves nothing written.
  const myPid = new Map(index.mine.map((r) => [r.trip.id, r.myPid]));
  const nameOf = (pid: string) => index.byPid.get(pid)?.name ?? '';
  const proposalIds: string[] = [];
  for (const step of plan.steps) {
    if (step.kind !== 'ask_admin' && step.kind !== 'ask_user') continue;
    const guestPid = step.kind === 'ask_admin' ? step.fromPid : step.guestPid;
    const intoPid = step.kind === 'ask_admin' ? step.intoPid : null;
    const targetUserId = step.kind === 'ask_user' ? step.userId : null;
    const id = await insertProposal(db, {
      tripId: step.tripId,
      guestPid,
      intoPid,
      targetUserId,
      requestedBy: user.id,
      needsUser: step.kind === 'ask_user',
      needsAdmin: step.kind === 'ask_admin' || step.needsAdmin,
    });
    proposalIds.push(id);
    await commitTripWrite(db, step.tripId, [], {
      action: 'merge_proposed',
      actorParticipantId: myPid.get(step.tripId) ?? null,
      actorUserId: user.id,
      actorDevice: device,
      details: {
        proposalId: id,
        participantId: guestPid,
        name: nameOf(guestPid),
        ...(intoPid ? { intoId: intoPid, intoName: nameOf(intoPid) } : {}),
        ...(targetUserId ? { targetUserId, targetName: index.people.get(`u:${targetUserId}`)?.name ?? '' } : {}),
      },
    });
  }

  let key = a.key;
  const linked = plan.steps.some((s) => s.kind === 'link');
  if (linked) key = await linkGuests(db, user, parseLinkKeys([a.key, b.key]), device);

  for (const step of plan.steps) {
    if (step.kind !== 'merge') continue;
    const actor = await resolveActor(c, step.tripId);
    if (actor.kind === 'viewer') throw new ApiError('FORBIDDEN', 403);
    assertWritable(actor.trip);
    ensure(actor, 'merge');
    await mergeParticipants(db, step.tripId, step.fromPid, step.intoPid, actor);
    // Owners' links to the merged row now point at the survivor.
    if (key === `p:${step.fromPid}`) key = `p:${step.intoPid}`;
  }

  return { key, proposals: proposalIds };
}

export function mergeOptionsRoutes(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();

  app.get('/me/people/:key/merge-options', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    const body = await loadMergeOptions(getDb(c.env), user.id, parseKey(c.req.param('key')));
    if (!body) throw new ApiError('NOT_FOUND', 404);
    return c.json(body);
  });

  // The picker's Confirm: link, merge in a group, or ask, as the server's own plan says.
  app.post('/me/people/merge', requireUser, async (c) => {
    const user = (await getSessionUser(c))!;
    let body: { keys?: unknown } | null;
    try {
      body = await c.req.json<{ keys?: unknown } | null>();
    } catch {
      throw new ApiError('VALIDATION', 422, 'Invalid request');
    }
    if (!body || typeof body !== 'object') throw new ApiError('VALIDATION', 422, 'Invalid request');
    return c.json(await executeMerge(c, user, parseMergeKeys(body.keys)));
  });

  return app;
}
