import type { TripView } from './api-types';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function parseTimeMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Returns up to `limit` active non-self participant IDs ordered by most recent
 * expense/payment activity, padded with remaining active people in `people` order.
 */
export function recentDirectPeopleIds(
  view: Pick<TripView, 'people' | 'expenses' | 'payments'>,
  meId: string,
  limit = 4,
): string[] {
  const activeIds = new Set(
    view.people.filter((p) => p.status === 'active' && p.id !== meId).map((p) => p.id),
  );

  const events: { createdAt: string; ids: string[] }[] = [
    ...view.expenses.map((e) => ({
      createdAt: e.createdAt ?? '',
      ids: [e.payerId, ...e.shares.map((s) => s.participantId)],
    })),
    ...view.payments.map((p) => ({
      createdAt: p.createdAt,
      ids: [p.fromId, p.toId],
    })),
  ];

  events.sort((a, b) => parseTimeMs(b.createdAt) - parseTimeMs(a.createdAt));

  const seen = new Set<string>();
  const result: string[] = [];

  for (const event of events) {
    for (const id of event.ids) {
      if (activeIds.has(id) && !seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
  }

  for (const person of view.people) {
    if (activeIds.has(person.id) && !seen.has(person.id)) {
      seen.add(person.id);
      result.push(person.id);
    }
  }

  return result.slice(0, Math.max(0, limit));
}

export interface OwedLine {
  personId: string;
  amount: number;
  direction: 'owesMe' | 'iOwe';
}

/**
 * Summarizes my share and per-person owed lines from a split's shares and payer.
 */
export function owedLines(
  shares: { participantId: string; amount: number }[],
  payerId: string,
  meId: string,
): { myShare: number; lines: OwedLine[] } {
  let myShare = 0;
  for (const share of shares) {
    if (share.participantId === meId) {
      myShare += share.amount;
    }
  }

  if (payerId === meId) {
    const lines: OwedLine[] = [];
    for (const share of shares) {
      if (share.participantId !== meId && share.amount > 0) {
        lines.push({
          personId: share.participantId,
          amount: share.amount,
          direction: 'owesMe',
        });
      }
    }
    return { myShare, lines };
  }

  const lines: OwedLine[] =
    myShare > 0 ? [{ personId: payerId, amount: myShare, direction: 'iOwe' }] : [];
  return { myShare, lines };
}

/**
 * Builds a 1–80 character quick-expense description from the trimmed note or fallback.
 */
export function quickExpenseDescription(input: { note: string; fallback: string }): string {
  const trimmedNote = input.note.trim();
  const base = trimmedNote.length > 0 ? trimmedNote : input.fallback.trim();
  return base.slice(0, 80).trim();
}

export type TimeBand = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

/**
 * Maps an hour (0–23) to a time-of-day band.
 */
export function timeBand(hour: number): TimeBand {
  if (hour >= 5 && hour <= 9) return 'morning';
  if (hour >= 10 && hour <= 13) return 'midday';
  if (hour >= 14 && hour <= 17) return 'afternoon';
  if (hour >= 18 && hour <= 22) return 'evening';
  return 'night';
}

export type AmountBand = 'small' | 'medium' | 'large' | 'huge';

/**
 * Maps a VND amount to an amount band.
 */
export function amountBand(vnd: number): AmountBand {
  if (vnd < 50_000) return 'small';
  if (vnd < 200_000) return 'medium';
  if (vnd < 1_000_000) return 'large';
  return 'huge';
}

export interface GuessEntry {
  categoryId: string | null;
  type: 'expense' | 'income' | string;
  amount: number;
  date: string;
  time: string | null;
  createdAt: string;
}

export interface GuessPersonRow {
  personNames: string[];
  categoryId: string | null;
  activityAt: string;
}

function entryHour(entry: GuessEntry): number | null {
  if (entry.time) {
    const match = /^(\d{1,2}):\d{2}/.exec(entry.time.trim());
    if (match) {
      const hour = Number(match[1]);
      if (hour >= 0 && hour <= 23) return hour;
    }
  }
  const created = new Date(entry.createdAt);
  if (Number.isNaN(created.getTime())) return null;
  return created.getHours();
}

/** The entry's own date decides whether it is inside the 90-day window. */
function entryTimestampMs(entry: GuessEntry): number {
  const dateMs = Date.parse(entry.date);
  return Number.isNaN(dateMs) ? parseTimeMs(entry.createdAt) : dateMs;
}

function compareRecency(a: GuessEntry, b: GuessEntry): number {
  if (a.date !== b.date) {
    return a.date > b.date ? 1 : -1;
  }
  return parseTimeMs(a.createdAt) - parseTimeMs(b.createdAt);
}

/**
 * Guesses an expense category from recent shared-person history, falling back to
 * the most frequent expense category in the same time and amount band within 90 days.
 */
export function guessExpenseCategory(input: {
  entries: GuessEntry[];
  personRows: GuessPersonRow[];
  personNames: string[];
  amount: number;
  now: Date;
}): string | null {
  if (input.personNames.length > 0) {
    const wanted = new Set(input.personNames);
    let bestRow: GuessPersonRow | null = null;
    let bestActivityMs = -Infinity;

    for (const row of input.personRows) {
      if (row.categoryId === null) continue;
      if (!row.personNames.some((name) => wanted.has(name))) continue;
      const activityMs = parseTimeMs(row.activityAt);
      if (bestRow === null || activityMs > bestActivityMs) {
        bestRow = row;
        bestActivityMs = activityMs;
      }
    }

    if (bestRow !== null) {
      return bestRow.categoryId;
    }
  }

  const targetTimeBand = timeBand(input.now.getHours());
  const targetAmountBand = amountBand(input.amount);
  const cutoffMs = input.now.getTime() - NINETY_DAYS_MS;

  const stats = new Map<string, { count: number; latest: GuessEntry }>();

  for (const entry of input.entries) {
    if (entry.type !== 'expense' || !entry.categoryId) continue;
    if (entryTimestampMs(entry) < cutoffMs) continue;

    const hour = entryHour(entry);
    if (hour === null || timeBand(hour) !== targetTimeBand) continue;
    if (amountBand(entry.amount) !== targetAmountBand) continue;

    const existing = stats.get(entry.categoryId);
    if (!existing) {
      stats.set(entry.categoryId, { count: 1, latest: entry });
    } else {
      existing.count += 1;
      if (compareRecency(entry, existing.latest) > 0) {
        existing.latest = entry;
      }
    }
  }

  let winnerId: string | null = null;
  let winnerStats: { count: number; latest: GuessEntry } | null = null;

  for (const [categoryId, entryStats] of stats.entries()) {
    if (entryStats.count < 2) continue;
    if (
      winnerStats === null ||
      entryStats.count > winnerStats.count ||
      (entryStats.count === winnerStats.count &&
        compareRecency(entryStats.latest, winnerStats.latest) > 0)
    ) {
      winnerId = categoryId;
      winnerStats = entryStats;
    }
  }

  return winnerId;
}
