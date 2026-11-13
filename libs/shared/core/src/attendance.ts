/**
 * Attendance reliability scores for sport groups (#87).
 * Pure functions: presence (regular ↔ rare), reliability (no-shows), guests brought,
 * labels, and the plan-form turnout estimate. Spec: docs/superpowers/specs/2026-11-13-attendance-reliability-design.md
 */

export const ATTENDANCE = {
  joinBase: 0.08,
  joinStep: 0.04,
  joinCap: 0.35,
  skipBase: 0.2,
  skipGrowth: 1.5,
  skipCap: 0.6,
  presenceStart: 30,
  reliabilityStart: 80,
  guestDecay: 0.8,
  regularAt: 75,
  rareAt: 20,
  flakyAt: 50,
  minSessions: 5,
  newcomerChance: 0.8,
} as const;

export interface AttendanceSession {
  rootId: string;
  spentOn: string;
  planned: boolean;
  planIds: string[];
  bill: { participantId: string; slots: number }[];
}

export interface AttendanceScore {
  participantId: string;
  presence: number;
  reliability: number;
  guest: number;
  presenceJoinStreak: number;
  presenceSkipStreak: number;
  reliabilityJoinStreak: number;
  reliabilitySkipStreak: number;
  sessionsSeen: number;
  sessionsPlanned: number;
  timesPlayed: number;
  guestsTotal: number;
  lastPlayedOn: string | null;
  lastSessionRoot: string | null;
  lastBack: boolean;
  lastReturnGap: number;
  lastEndedNoShowStreak: number;
}

export type AttendanceLabel = 'new' | 'regular' | 'rare' | 'flaky' | 'topGuest' | 'back';

export function newScore(participantId: string): AttendanceScore {
  return {
    participantId,
    presence: ATTENDANCE.presenceStart,
    reliability: ATTENDANCE.reliabilityStart,
    guest: 0,
    presenceJoinStreak: 0,
    presenceSkipStreak: 0,
    reliabilityJoinStreak: 0,
    reliabilitySkipStreak: 0,
    sessionsSeen: 0,
    sessionsPlanned: 0,
    timesPlayed: 0,
    guestsTotal: 0,
    lastPlayedOn: null,
    lastSessionRoot: null,
    lastBack: false,
    lastReturnGap: 0,
    lastEndedNoShowStreak: 0,
  };
}

/** `streak`: joins in a row including this one. */
export function joinStep(score: number, streak: number): number {
  const gain = Math.min(ATTENDANCE.joinBase + ATTENDANCE.joinStep * (streak - 1), ATTENDANCE.joinCap);
  return score + gain * (100 - score);
}

/** `streak`: skips in a row including this one. */
export function skipStep(score: number, streak: number): number {
  const loss = Math.min(ATTENDANCE.skipBase * ATTENDANCE.skipGrowth ** (streak - 1), ATTENDANCE.skipCap);
  return score * (1 - loss);
}

/** `active`: ids that may be stepped as "skipped" (tracked, not left). Anyone on the plan or bill gets a row. Returns a new map. */
export function applySession(
  scores: ReadonlyMap<string, AttendanceScore>,
  session: AttendanceSession,
  active: ReadonlySet<string>,
): Map<string, AttendanceScore> {
  const out = new Map(scores);
  const slots = new Map<string, number>();
  for (const e of session.bill) slots.set(e.participantId, (slots.get(e.participantId) ?? 0) + e.slots);
  const plan = new Set(session.planned ? session.planIds : []);

  const ids = new Set<string>([...plan, ...slots.keys(), ...active]);
  for (const id of ids) {
    const onBill = slots.has(id);
    const onPlan = plan.has(id);
    if (!onBill && !onPlan && !active.has(id)) continue;
    const prev = scores.get(id) ?? newScore(id);
    const next: AttendanceScore = { ...prev };

    if (onBill) {
      next.presenceJoinStreak = prev.presenceJoinStreak + 1;
      next.presenceSkipStreak = 0;
      next.presence = joinStep(prev.presence, next.presenceJoinStreak);
    } else {
      next.presenceSkipStreak = prev.presenceSkipStreak + 1;
      next.presenceJoinStreak = 0;
      next.presence = skipStep(prev.presence, next.presenceSkipStreak);
    }

    if (onPlan) {
      if (onBill) {
        next.reliabilityJoinStreak = prev.reliabilityJoinStreak + 1;
        next.reliabilitySkipStreak = 0;
        next.reliability = joinStep(prev.reliability, next.reliabilityJoinStreak);
      } else {
        next.reliabilitySkipStreak = prev.reliabilitySkipStreak + 1;
        next.reliabilityJoinStreak = 0;
        next.reliability = skipStep(prev.reliability, next.reliabilitySkipStreak);
      }
      next.sessionsPlanned = prev.sessionsPlanned + 1;
    }

    const brought = Math.max(0, (slots.get(id) ?? 0) - 1);
    next.guest = ATTENDANCE.guestDecay * prev.guest + brought;
    next.guestsTotal = prev.guestsTotal + brought;

    next.sessionsSeen = prev.sessionsSeen + 1;
    if (onBill) {
      next.timesPlayed = prev.timesPlayed + 1;
      next.lastPlayedOn = session.spentOn;
    }
    next.lastBack = onBill && prev.presence <= ATTENDANCE.rareAt && prev.sessionsSeen >= ATTENDANCE.minSessions;
    next.lastReturnGap = onBill ? prev.presenceSkipStreak : 0;
    next.lastEndedNoShowStreak = onPlan && onBill ? prev.reliabilitySkipStreak : 0;
    next.lastSessionRoot = session.rootId;

    out.set(id, next);
  }
  return out;
}

const isNewcomer = (s: AttendanceScore) => s.sessionsSeen < ATTENDANCE.minSessions;

export function attendanceLabels(
  score: AttendanceScore,
  ctx: { latestRootId: string | null; topGuestId: string | null },
): AttendanceLabel[] {
  if (isNewcomer(score)) return ['new'];
  const labels: AttendanceLabel[] = [];
  if (score.presence >= ATTENDANCE.regularAt) labels.push('regular');
  if (score.presence <= ATTENDANCE.rareAt) labels.push('rare');
  if (score.reliability <= ATTENDANCE.flakyAt && score.sessionsPlanned >= ATTENDANCE.minSessions) labels.push('flaky');
  if (ctx.topGuestId !== null && ctx.topGuestId === score.participantId) labels.push('topGuest');
  if (score.lastBack && ctx.latestRootId !== null && score.lastSessionRoot === ctx.latestRootId) labels.push('back');
  return labels;
}

/** Highest guest score ≥ 1; ties → higher guestsTotal, then lower id. */
export function topGuestId(scores: Iterable<AttendanceScore>): string | null {
  let best: AttendanceScore | null = null;
  for (const s of scores) {
    if (s.guest < 1) continue;
    if (
      !best ||
      s.guest > best.guest ||
      (s.guest === best.guest &&
        (s.guestsTotal > best.guestsTotal || (s.guestsTotal === best.guestsTotal && s.participantId < best.participantId)))
    ) {
      best = s;
    }
  }
  return best?.participantId ?? null;
}

/** A no-show streak of 2+ ended by playing in the latest session. */
export function wantedStamp(score: AttendanceScore, latestRootId: string | null): boolean {
  return latestRootId !== null && score.lastSessionRoot === latestRootId && score.lastEndedNoShowStreak >= 2;
}

/** Slots weighted by reliability ÷ 100 (newcomers at `newcomerChance`); buckets count slots. */
export function turnoutEstimate(
  entries: { participantId: string; slots: number }[],
  scores: ReadonlyMap<string, AttendanceScore>,
): { likely: number; total: number; sure: number; unsure: number; flaky: number } {
  let likely = 0;
  let total = 0;
  let sure = 0;
  let unsure = 0;
  let flaky = 0;
  for (const e of entries) {
    const s = scores.get(e.participantId);
    total += e.slots;
    if (!s || isNewcomer(s)) {
      likely += e.slots * ATTENDANCE.newcomerChance;
      sure += e.slots;
      continue;
    }
    likely += e.slots * (s.reliability / 100);
    if (s.reliability >= ATTENDANCE.regularAt) sure += e.slots;
    else if (s.reliability <= ATTENDANCE.flakyAt && s.sessionsPlanned >= ATTENDANCE.minSessions) flaky += e.slots;
    else unsure += e.slots;
  }
  return { likely: Math.round(likely), total, sure, unsure, flaky };
}

/** Max of every number; last* fields from the score with the later lastPlayedOn (tie → `into`). */
export function mergeScores(into: AttendanceScore, from: AttendanceScore): AttendanceScore {
  const later =
    from.lastPlayedOn !== null && (into.lastPlayedOn === null || from.lastPlayedOn > into.lastPlayedOn) ? from : into;
  return {
    participantId: into.participantId,
    presence: Math.max(into.presence, from.presence),
    reliability: Math.max(into.reliability, from.reliability),
    guest: Math.max(into.guest, from.guest),
    presenceJoinStreak: Math.max(into.presenceJoinStreak, from.presenceJoinStreak),
    presenceSkipStreak: Math.max(into.presenceSkipStreak, from.presenceSkipStreak),
    reliabilityJoinStreak: Math.max(into.reliabilityJoinStreak, from.reliabilityJoinStreak),
    reliabilitySkipStreak: Math.max(into.reliabilitySkipStreak, from.reliabilitySkipStreak),
    sessionsSeen: Math.max(into.sessionsSeen, from.sessionsSeen),
    sessionsPlanned: Math.max(into.sessionsPlanned, from.sessionsPlanned),
    timesPlayed: Math.max(into.timesPlayed, from.timesPlayed),
    guestsTotal: Math.max(into.guestsTotal, from.guestsTotal),
    lastPlayedOn: later.lastPlayedOn,
    lastSessionRoot: later.lastSessionRoot,
    lastBack: later.lastBack,
    lastReturnGap: later.lastReturnGap,
    lastEndedNoShowStreak: later.lastEndedNoShowStreak,
  };
}
