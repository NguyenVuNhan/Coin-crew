import { and, eq, inArray, like } from 'drizzle-orm';
import type { AttendanceSession, ExpenseMeta } from '@cc/core';
import type { Db } from '@cc/api-db/client';
import { participants, transactions } from '@cc/api-db/schema';

function parseMeta(json: string | null): ExpenseMeta | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ExpenseMeta;
  } catch {
    return null;
  }
}

/** D1 caps bound parameters per statement; chunk the IN list well below it. */
export const IN_CHUNK = 90;

/**
 * Finished sport sessions oldest first (spentOn, then root created_at); skips roots in `exclude`.
 * A finished session is an approved latest head with a sport block that is not planning. Whether it
 * was planned, and who was on the plan, comes from the chain's history: walking from the head back
 * along parent_id, the first planning version reached is the plan (a later edit can drop the planning
 * flag from the head, and a bill rolled back to planning and re-planned must use the newest plan).
 * Reaching the root without one means a direct bill.
 */
export async function loadSportSessions(db: Db, tripId: string, exclude: ReadonlySet<string>): Promise<AttendanceSession[]> {
  const heads = await db
    .select({ id: transactions.id, rootId: transactions.rootId, spentOn: transactions.spentOn, metaJson: transactions.metaJson })
    .from(transactions)
    .where(
      and(
        eq(transactions.tripId, tripId),
        eq(transactions.type, 'expense'),
        eq(transactions.isLatest, 1),
        eq(transactions.status, 'approved'),
        like(transactions.metaJson, '%"sport"%'),
      ),
    )
    .all();

  const finished = new Map<string, { headId: string; spentOn: string; meta: ExpenseMeta }>();
  for (const h of heads) {
    if (exclude.has(h.rootId)) continue;
    const meta = parseMeta(h.metaJson);
    if (!meta?.sport || meta.sport.planning === true) continue;
    finished.set(h.rootId, { headId: h.id, spentOn: h.spentOn, meta });
  }
  if (finished.size === 0) return [];

  const roots = [...finished.keys()];
  const chunks: string[][] = [];
  for (let i = 0; i < roots.length; i += IN_CHUNK) chunks.push(roots.slice(i, i + IN_CHUNK));
  const versionQuery = (ids: string[]) =>
    db
      .select({
        id: transactions.id,
        parentId: transactions.parentId,
        metaJson: transactions.metaJson,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(and(eq(transactions.tripId, tripId), inArray(transactions.rootId, ids)));
  const versions = new Map<string, { parentId: string | null; metaJson: string | null; createdAt: string }>();
  for (const rows of await Promise.all(chunks.map((ids) => versionQuery(ids).all()))) {
    for (const v of rows) versions.set(v.id, v);
  }

  const sessions: (AttendanceSession & { createdAt: string })[] = [];
  for (const [rootId, { headId, spentOn, meta }] of finished) {
    // Walk head → root: the first planning version reached is the plan; the root row gives created_at.
    let plan: ExpenseMeta | null = null;
    let createdAt = '';
    const seen = new Set<string>();
    for (let id: string | null = headId; id !== null && !seen.has(id); ) {
      seen.add(id);
      const v = versions.get(id);
      if (!v) break;
      createdAt = v.createdAt;
      if (!plan) {
        const m = parseMeta(v.metaJson);
        if (m?.sport?.planning === true) plan = m;
      }
      id = v.parentId;
    }
    const planEntries = plan?.sport?.entries ?? null;
    sessions.push({
      rootId,
      spentOn,
      createdAt,
      planned: planEntries !== null,
      planIds: planEntries ? [...new Set(planEntries.map((e) => e.participantId))] : [],
      // The form always writes at least one slot per entry; this guards hand-built 0+0 entries sent
      // straight to the API, which would otherwise count as "played" (any bill entry marks presence).
      bill: (meta.sport!.entries ?? [])
        .map((e) => ({ participantId: e.participantId, slots: e.maleSlots + e.femaleSlots }))
        .filter((e) => e.slots > 0),
    });
  }

  sessions.sort(
    (a, b) =>
      a.spentOn.localeCompare(b.spentOn) || a.createdAt.localeCompare(b.createdAt) || a.rootId.localeCompare(b.rootId),
  );
  return sessions.map(({ createdAt: _createdAt, ...s }) => s);
}

/** id → survivor id (follows merged_into), and the set of ids still active (not left/merged). */
export async function loadPeople(db: Db, tripId: string): Promise<{ resolve: (id: string) => string; active: Set<string> }> {
  const rows = await db
    .select({ id: participants.id, status: participants.status, mergedInto: participants.mergedInto })
    .from(participants)
    .where(eq(participants.tripId, tripId))
    .all();

  const mergedInto = new Map<string, string>();
  const active = new Set<string>();
  for (const r of rows) {
    if (r.status === 'active') active.add(r.id);
    if (r.status === 'merged' && r.mergedInto) mergedInto.set(r.id, r.mergedInto);
  }

  const resolve = (id: string): string => {
    let cur = id;
    const seen = new Set<string>([cur]);
    for (let next = mergedInto.get(cur); next !== undefined && !seen.has(next); next = mergedInto.get(cur)) {
      cur = next;
      seen.add(cur);
    }
    return cur;
  };
  return { resolve, active };
}
