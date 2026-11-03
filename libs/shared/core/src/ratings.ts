export const RATING_STAR_MULTIPLIER = 2;
export const RATING_MAX_STARS_PER_TARGET = 5;
export const RATING_SEARCH_THRESHOLD = 12;
export const RATING_INITIAL_VISIBLE = 10;

export interface RankedPlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  gender: 'M' | 'F' | null;
  isMember: boolean;
  stars: number;
  /** 1-based leaderboard position; `null` for players nobody has given a star yet (they are unranked). */
  rank: number | null;
}

/** Total star budget for each signed-in member in a group with `activeCount` active participants. */
export function maxStarsForGroup(activeCount: number): number {
  return Math.max(0, activeCount) * RATING_STAR_MULTIPLIER;
}

/**
 * Ranks active participants by total stars descending, tie-broken by their order in `people`.
 * Players without any star come last, sorted by name, and get no rank.
 */
export function rankPlayers(
  people: {
    id: string;
    name: string;
    status: string;
    avatarUrl?: string | null;
    gender?: 'M' | 'F' | null;
    isMember: boolean;
  }[],
  totalStars: Record<string, number>,
): RankedPlayer[] {
  const active = people
    .filter((p) => p.status === 'active')
    .map((p, orderIndex) => ({
      id: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl ?? null,
      gender: p.gender ?? null,
      isMember: p.isMember,
      stars: Math.max(0, totalStars[p.id] ?? 0),
      orderIndex,
    }));

  active.sort((a, b) => {
    if (b.stars !== a.stars) return b.stars - a.stars;
    if (a.stars === 0) return a.name.localeCompare(b.name, 'vi') || a.orderIndex - b.orderIndex;
    return a.orderIndex - b.orderIndex;
  });

  return active.map((item, idx) => ({
    id: item.id,
    name: item.name,
    avatarUrl: item.avatarUrl,
    gender: item.gender,
    isMember: item.isMember,
    stars: item.stars,
    rank: item.stars > 0 ? idx + 1 : null,
  }));
}

/** Computes the caller's spent stars, remaining budget, and whether they are over budget after a roster shrink. */
export function ratingBudget(
  activeCount: number,
  myAllocations: Record<string, number>,
): { maxStars: number; spentStars: number; remainingStars: number; overBudgetBy: number } {
  const maxStars = maxStarsForGroup(activeCount);
  const spentStars = Object.values(myAllocations).reduce((sum, n) => sum + (n > 0 ? n : 0), 0);
  const remainingStars = Math.max(0, maxStars - spentStars);
  const overBudgetBy = Math.max(0, spentStars - maxStars);
  return { maxStars, spentStars, remainingStars, overBudgetBy };
}
