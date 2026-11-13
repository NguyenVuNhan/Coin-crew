import { and, asc, eq, inArray, like } from 'drizzle-orm';
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
const IN_CHUNK = 90;

/**
 * Finished sport sessions oldest first (spentOn, then root created_at); skips roots in `exclude`.
 * A finished session is an approved latest head with a sport block that is not planning. Whether it
 * was planned, and who was on the plan, comes from the chain's history: the last planning version
 * before the first non-planning one (a later edit can drop the planning flag from the head).
 */
export async function loadSportSessions(db: Db, tripId: string, exclude: ReadonlySet<string>): Promise<AttendanceSession[]> {
  const heads = await db
    .select({ rootId: transactions.rootId, spentOn: transactions.spentOn, metaJson: transactions.metaJson })
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

  const finished = new Map<string, { spentOn: string; meta: ExpenseMeta }>();
  for (const h of heads) {
    if (exclude.has(h.rootId)) continue;
    const meta = parseMeta(h.metaJson);
    if (!meta?.sport || meta.sport.planning === true) continue;
    finished.set(h.rootId, { spentOn: h.spentOn, meta });
  }
  if (finished.size === 0) return [];

  const roots = [...finished.keys()];
  const chunks: string[][] = [];
  for (let i = 0; i < roots.length; i += IN_CHUNK) chunks.push(roots.slice(i, i + IN_CHUNK));
  const versionQuery = (ids: string[]) =>
    db
      .select({ rootId: transactions.rootId, metaJson: transactions.metaJson, createdAt: transactions.createdAt })
      .from(transactions)
      .where(and(eq(transactions.tripId, tripId), inArray(transactions.rootId, ids)))
      .orderBy(asc(transactions.createdAt), asc(transactions.id));
  const versions = (await Promise.all(chunks.map((ids) => versionQuery(ids).all()))).flat();

  // Per root: first version's created_at, and the last planning version before the first non-planning one.
  const chains = new Map<string, { createdAt: string; done: boolean; plan: ExpenseMeta | null }>();
  for (const v of versions) {
    let chain = chains.get(v.rootId);
    if (!chain) {
      chain = { createdAt: v.createdAt, done: false, plan: null };
      chains.set(v.rootId, chain);
    }
    if (chain.done) continue;
    const meta = parseMeta(v.metaJson);
    if (meta?.sport?.planning === true) chain.plan = meta;
    else chain.done = true;
  }

  const sessions: (AttendanceSession & { createdAt: string })[] = [];
  for (const [rootId, { spentOn, meta }] of finished) {
    const chain = chains.get(rootId);
    const planEntries = chain?.plan?.sport?.entries ?? null;
    sessions.push({
      rootId,
      spentOn,
      createdAt: chain?.createdAt ?? '',
      planned: planEntries !== null,
      planIds: planEntries ? [...new Set(planEntries.map((e) => e.participantId))] : [],
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
