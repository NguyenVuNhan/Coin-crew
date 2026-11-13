import { and, eq, inArray, or } from 'drizzle-orm';
import {
  applySession,
  attendanceLabels,
  topGuestId,
  wantedStamp,
  type AttendanceScore,
  type AttendanceSession,
  type AttendanceView,
} from '@cc/core';
import type { Db } from '@cc/api-db/client';
import { transactions } from '@cc/api-db/schema';
import { commitAttendance, readAttendance } from '@cc/api-db/attendance';
import { loadPeople, loadSportSessions } from './sessions';

/** D1 caps bound parameters per statement; chunk the IN list well below it. */
const IN_CHUNK = 90;

function resolveSession(s: AttendanceSession, resolve: (id: string) => string): AttendanceSession {
  return {
    ...s,
    planIds: [...new Set(s.planIds.map(resolve))],
    bill: s.bill.map((e) => ({ participantId: resolve(e.participantId), slots: e.slots })),
  };
}

/**
 * Stored scores plus every finished session not yet counted, folded oldest first. A person is
 * stepped as "skipped" only once tracked (a score row, stored or made earlier in this fold) and
 * while still active; anyone else gets a row only by being on a plan or bill.
 */
async function fold(db: Db, tripId: string) {
  const { version, scores: stored, counted } = await readAttendance(db, tripId);
  const [sessions, people] = await Promise.all([loadSportSessions(db, tripId, counted), loadPeople(db, tripId)]);
  let scores: Map<string, AttendanceScore> = stored;
  for (const raw of sessions) {
    const active = new Set([...scores.keys()].filter((id) => people.active.has(id)));
    scores = applySession(scores, resolveSession(raw, people.resolve), active);
  }
  return { version, stored, scores, sessions, people };
}

/** Counts every finished sport session not yet counted and stores the scores. Never re-counts a root. */
export async function countPendingSessions(db: Db, tripId: string): Promise<'counted' | 'nothing' | 'raced'> {
  const { version, stored, scores, sessions } = await fold(db, tripId);
  if (sessions.length === 0) return 'nothing';
  // applySession only replaces the rows it steps, so an unchanged object means an unchanged row.
  const changed = [...scores.values()].filter((s) => stored.get(s.participantId) !== s);
  const result = await commitAttendance(
    db,
    tripId,
    version,
    changed,
    sessions.map((s) => s.rootId),
  );
  return result === 'written' ? 'counted' : 'raced';
}

/** The latest of these roots by loadSportSessions' order: head spentOn, then root created_at, then root id. */
async function latestOf(db: Db, tripId: string, roots: string[]): Promise<{ rootId: string; spentOn: string } | null> {
  if (roots.length === 0) return null;
  const info = new Map<string, { spentOn?: string; createdAt?: string }>();
  for (let i = 0; i < roots.length; i += IN_CHUNK) {
    const rows = await db
      .select({
        id: transactions.id,
        rootId: transactions.rootId,
        isLatest: transactions.isLatest,
        spentOn: transactions.spentOn,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.tripId, tripId),
          inArray(transactions.rootId, roots.slice(i, i + IN_CHUNK)),
          or(eq(transactions.isLatest, 1), eq(transactions.id, transactions.rootId)),
        ),
      )
      .all();
    for (const r of rows) {
      const cur = info.get(r.rootId) ?? {};
      if (r.isLatest === 1) cur.spentOn = r.spentOn;
      if (r.id === r.rootId) cur.createdAt = r.createdAt;
      info.set(r.rootId, cur);
    }
  }
  let best: { rootId: string; spentOn: string; createdAt: string } | null = null;
  for (const [rootId, { spentOn, createdAt = '' }] of info) {
    if (spentOn === undefined) continue;
    if (
      !best ||
      spentOn.localeCompare(best.spentOn) > 0 ||
      (spentOn === best.spentOn &&
        (createdAt.localeCompare(best.createdAt) > 0 ||
          (createdAt === best.createdAt && rootId.localeCompare(best.rootId) > 0)))
    ) {
      best = { rootId, spentOn, createdAt };
    }
  }
  return best ? { rootId: best.rootId, spentOn: best.spentOn } : null;
}

/** Stored scores with every uncounted finished session folded in, in memory only. Active people only. */
export async function previewAttendance(db: Db, tripId: string): Promise<AttendanceView> {
  const { scores, sessions, people } = await fold(db, tripId);

  const candidates = new Set<string>();
  for (const s of scores.values()) if (s.lastSessionRoot) candidates.add(s.lastSessionRoot);
  const lastPending = sessions.at(-1);
  if (lastPending) candidates.add(lastPending.rootId);
  const latestSession = await latestOf(db, tripId, [...candidates]);
  const latestRootId = latestSession?.rootId ?? null;

  const shown = [...scores.values()].filter((s) => people.active.has(s.participantId));
  const top = topGuestId(shown);
  return {
    people: shown.map((score) => ({
      participantId: score.participantId,
      score,
      labels: attendanceLabels(score, { latestRootId, topGuestId: top }),
      wantedStamp: wantedStamp(score, latestRootId),
    })),
    latestSession,
    pendingSessions: sessions.length,
  };
}
