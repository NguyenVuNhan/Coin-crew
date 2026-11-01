import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { call, seedTrip, seedUser, memberSid, guestHeaders, T, U, PID } from './helpers';
import { getDb } from '../src/db/client';
import { insertProposal, pendingProposalFor } from '../src/proposals/store';

const base = `/api/trips/${T.tripId}`;
const post = (path: string, headers: Record<string, string>, body?: unknown) =>
  call(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

/** A guest on `pid` who is also signed in as `userId`. */
async function signedInGuest(pid: string, userId: string) {
  const sid = await memberSid(userId, userId);
  const g = await guestHeaders(pid);
  return { ...g, Cookie: `${g.Cookie}; sid=${sid}` };
}

const proposal = (guestPid: string, targetUserId: string | null = U.an) => ({
  tripId: T.tripId,
  guestPid,
  intoPid: null,
  targetUserId,
  requestedBy: U.minh,
  needsUser: true,
  needsAdmin: false,
});

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

beforeEach(async () => {
  await seedTrip();
  await seedUser(U.an, 'An');
});

describe('merge proposals', () => {
  it('insertProposal stores a pending proposal and pendingProposalFor finds it', async () => {
    const db = getDb(env);
    const id = await insertProposal(db, proposal(PID.A));
    const row = await pendingProposalFor(db, PID.A);
    expect(row).toEqual(expect.objectContaining({
      id, tripId: T.tripId, guestPid: PID.A, intoPid: null, targetUserId: U.an, requestedByUserId: U.minh,
      needsUser: 1, needsAdmin: 0, userAcceptedAt: null, adminAcceptedAt: null, status: 'pending', decidedAt: null,
    }));
    expect(await pendingProposalFor(db, PID.B)).toBeNull();
  });

  it('insertProposal refuses when a claim is pending on the guest', async () => {
    const claim = await post('/membership', await signedInGuest(PID.A, 'u-claimer'), { participantId: PID.A });
    expect(claim.status).toBe(201);
    expect(await codeOf(insertProposal(getDb(env), proposal(PID.A)))).toBe('ALREADY_CLAIMED');
    expect(await pendingProposalFor(getDb(env), PID.A)).toBeNull();
  });

  it('insertProposal on a guest that is no longer there is already handled', async () => {
    await env.DB.prepare("UPDATE participants SET status = 'merged', merged_into = ? WHERE id = ?").bind(PID.B, PID.A).run();
    expect(await codeOf(insertProposal(getDb(env), proposal(PID.A)))).toBe('ALREADY_HANDLED');
    // A signed-in participant is no guest.
    expect(await codeOf(insertProposal(getDb(env), proposal(PID.M)))).toBe('ALREADY_HANDLED');
  });

  it('a claim is refused while a proposal is pending on the guest', async () => {
    await insertProposal(getDb(env), proposal(PID.A));
    const claim = await post('/membership', await signedInGuest(PID.A, 'u-claimer'), { participantId: PID.A });
    expect(claim.status).toBe(409);
    expect(((await claim.json()) as { error: { code: string } }).error.code).toBe('ALREADY_CLAIMED');
    const { results } = await env.DB.prepare("SELECT id FROM membership_requests WHERE status = 'pending'").all();
    expect(results).toEqual([]);
  });

  it('a decided proposal no longer blocks a claim', async () => {
    const id = await insertProposal(getDb(env), proposal(PID.A));
    await env.DB.prepare("UPDATE merge_proposals SET status = 'declined' WHERE id = ?").bind(id).run();
    const claim = await post('/membership', await signedInGuest(PID.A, 'u-claimer'), { participantId: PID.A });
    expect(claim.status).toBe(201);
  });

  it('two concurrent insertProposal on one guest: one wins', async () => {
    const db = getDb(env);
    const results = await Promise.allSettled([insertProposal(db, proposal(PID.A)), insertProposal(db, proposal(PID.A))]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((loser.reason as { code?: string }).code).toBe('ALREADY_CLAIMED');
    const { results: rows } = await env.DB.prepare("SELECT id FROM merge_proposals WHERE guest_pid = ? AND status = 'pending'").bind(PID.A).all();
    expect(rows).toHaveLength(1);
  });
});
