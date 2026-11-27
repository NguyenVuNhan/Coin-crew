export interface TravelDef {
  id: string;
  tagId: string;
  name: string;
  start: string;
  end: string;
  countsFrom: string;
  groupIds: string[];
  budgetId: string | null;
}

export type TravelState = 'upcoming' | 'on' | 'done';

export type TravelMatch = { travel: TravelDef; mode: 'on' | 'leadup' };

function parseYmd(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

function diffDaysUtc(from: string, to: string): number {
  const [y1, m1, d1] = parseYmd(from);
  const [y2, m2, d2] = parseYmd(to);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86400000);
}

function pickEarliestStart(matches: TravelDef[]): TravelDef | null {
  if (matches.length === 0) return null;
  let best = matches[0]!;
  for (let i = 1; i < matches.length; i++) {
    const candidate = matches[i]!;
    if (candidate.start < best.start) {
      best = candidate;
    }
  }
  return best;
}

/** Returns whether a trip is upcoming, currently on, or done for the given local YYYY-MM-DD date. */
export function travelState(t: TravelDef, today: string): TravelState {
  if (today < t.start) return 'upcoming';
  if (today <= t.end) return 'on';
  return 'done';
}

/**
 * Matches a trip for a given date: 'on' when start <= date <= end, otherwise 'leadup'
 * when countsFrom <= date < start (picking the earliest start among matching lead-ups).
 */
export function travelForDate(travels: TravelDef[], date: string): TravelMatch | null {
  const onMatches = travels.filter((t) => t.start <= date && date <= t.end);
  const on = pickEarliestStart(onMatches);
  if (on) return { travel: on, mode: 'on' };

  const leadupMatches = travels.filter((t) => t.countsFrom <= date && date < t.start);
  const leadup = pickEarliestStart(leadupMatches);
  if (leadup) return { travel: leadup, mode: 'leadup' };

  return null;
}

/**
 * Matches a trip for a CoinCrew share: only trips whose groupIds include share.tripId
 * and whose countsFrom <= date <= end. Prefers 'on' over 'leadup', then earliest start.
 */
export function travelForShare(
  travels: TravelDef[],
  share: { tripId: string; date: string },
): TravelDef | null {
  const eligible = travels.filter(
    (t) => t.groupIds.includes(share.tripId) && t.countsFrom <= share.date && share.date <= t.end,
  );
  const onMatches = eligible.filter((t) => t.start <= share.date && share.date <= t.end);
  if (onMatches.length > 0) return pickEarliestStart(onMatches);
  return pickEarliestStart(eligible);
}

/**
 * Finds an existing trip whose active [start, end] range overlaps (including touching)
 * the given [start, end] range, ignoring lead-up windows and optional exceptId.
 */
export function findTravelOverlap(
  travels: TravelDef[],
  start: string,
  end: string,
  exceptId?: string,
): TravelDef | null {
  for (const t of travels) {
    if (exceptId !== undefined && t.id === exceptId) continue;
    if (start <= t.end && t.start <= end) return t;
  }
  return null;
}

/** Default countsFrom date: min(today, start). */
export function defaultCountsFrom(start: string, today: string): string {
  return today <= start ? today : start;
}

/** 1-based day index within a trip when today is inside [start, end], otherwise null. */
export function travelDayIndex(t: TravelDef, today: string): { day: number; of: number } | null {
  if (today < t.start || today > t.end) return null;
  return {
    day: diffDaysUtc(t.start, today) + 1,
    of: diffDaysUtc(t.start, t.end) + 1,
  };
}

/** Signed number of days from today until t.start. */
export function daysUntil(t: TravelDef, today: string): number {
  return diffDaysUtc(today, t.start);
}
