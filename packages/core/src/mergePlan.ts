import type { PersonKey } from './people';

export interface MergePlace { tripId: string; tripName: string; kind: 'group' | 'direct'; participantId: string; archived: boolean }
export interface MergeSide { key: PersonKey; userId: string | null; places: MergePlace[] }
export interface MergePlanContext {
  /** Trips where the caller may merge (admin/organiser; the caller's own ledger counts). */
  adminTripIds: ReadonlySet<string>;
  /** Guest participant id -> user id of a pending membership claim on it. */
  pendingClaims: ReadonlyMap<string, string>;
  /** Guest participant ids with a pending merge proposal. */
  pendingProposals: ReadonlySet<string>;
}
export type MergeStep =
  | { kind: 'link' }
  | { kind: 'merge'; tripId: string; tripName: string; fromPid: string; intoPid: string }
  | { kind: 'ask_admin'; tripId: string; tripName: string; fromPid: string; intoPid: string }
  | { kind: 'ask_user'; tripId: string; tripName: string; tripKind: 'group' | 'direct'; guestPid: string; userId: string; needsAdmin: boolean };
export type MergeTag = 'link' | 'merge' | 'ask_admin' | 'ask_user';
export type MergeBlock =
  | { reason: 'both_signed_in' }
  | { reason: 'claim_pending'; tripName: string; byTarget: boolean }
  | { reason: 'request_pending'; tripName: string };
export type MergePlan = { ok: true; tag: MergeTag; steps: MergeStep[] } | { ok: false; block: MergeBlock };

const TAG_RANK: Record<MergeTag, number> = { link: 0, merge: 1, ask_admin: 2, ask_user: 3 };

function strongestTag(steps: MergeStep[]): MergeTag {
  let tag: MergeTag = 'link';
  for (const s of steps) if (TAG_RANK[s.kind] > TAG_RANK[tag]) tag = s.kind;
  return tag;
}

const LINK_ONLY: MergePlan = { ok: true, tag: 'link', steps: [{ kind: 'link' }] };

/**
 * Decides how the person on the page (`a`) and the picked person (`b`) merge.
 * Pure: the caller supplies both sides and the pending claims/proposals.
 */
export function planMerge(a: MergeSide, b: MergeSide, ctx: MergePlanContext): MergePlan {
  if (a.userId !== null && b.userId !== null) return { ok: false, block: { reason: 'both_signed_in' } };

  // One side is signed in: one "is this you?" request per live place of the guest side.
  if (a.userId !== null || b.userId !== null) {
    const userId = (a.userId ?? b.userId) as string;
    const guestSide = a.userId === null ? a : b;
    const steps: MergeStep[] = [];
    for (const p of guestSide.places) {
      if (p.archived) continue;
      const claimBy = ctx.pendingClaims.get(p.participantId);
      if (claimBy !== undefined) {
        return { ok: false, block: { reason: 'claim_pending', tripName: p.tripName, byTarget: claimBy === userId } };
      }
      if (ctx.pendingProposals.has(p.participantId)) {
        return { ok: false, block: { reason: 'request_pending', tripName: p.tripName } };
      }
      steps.push({
        kind: 'ask_user',
        tripId: p.tripId,
        tripName: p.tripName,
        tripKind: p.kind,
        guestPid: p.participantId,
        userId,
        needsAdmin: p.kind === 'group' && !ctx.adminTripIds.has(p.tripId),
      });
    }
    // Every place of the guest is archived: nothing can be requested, so the view-only link is all that's left.
    if (steps.length === 0) return LINK_ONLY;
    return { ok: true, tag: 'ask_user', steps };
  }

  // Both guests: merge (or ask an admin to) in every live trip they share; link for the rest.
  const intoByTrip = new Map<string, MergePlace>();
  for (const p of a.places) if (!p.archived && !intoByTrip.has(p.tripId)) intoByTrip.set(p.tripId, p);

  const mergeSteps: MergeStep[] = [];
  let needsLink = false;
  for (const from of b.places) {
    const into = from.archived ? undefined : intoByTrip.get(from.tripId);
    if (!into) {
      needsLink = true;
      continue;
    }
    for (const pid of [from.participantId, into.participantId]) {
      if (ctx.pendingClaims.has(pid) || ctx.pendingProposals.has(pid)) {
        return { ok: false, block: { reason: 'request_pending', tripName: from.tripName } };
      }
    }
    mergeSteps.push({
      kind: ctx.adminTripIds.has(from.tripId) ? 'merge' : 'ask_admin',
      tripId: from.tripId,
      tripName: from.tripName,
      fromPid: from.participantId,
      intoPid: into.participantId,
    });
  }

  if (mergeSteps.length === 0) return LINK_ONLY;
  const steps: MergeStep[] = needsLink ? [{ kind: 'link' }, ...mergeSteps] : mergeSteps;
  return { ok: true, tag: strongestTag(steps), steps };
}
