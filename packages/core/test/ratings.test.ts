import { describe, expect, it } from 'vitest';
import {
  RATING_INITIAL_VISIBLE,
  RATING_MAX_STARS_PER_TARGET,
  RATING_SEARCH_THRESHOLD,
  RATING_STAR_MULTIPLIER,
  can,
  maxStarsForGroup,
  rankPlayers,
  ratingBudget,
} from '../src';

describe('ratings core helpers', () => {
  it('exports the configured rating constants', () => {
    expect(RATING_STAR_MULTIPLIER).toBe(2);
    expect(RATING_MAX_STARS_PER_TARGET).toBe(5);
    expect(RATING_SEARCH_THRESHOLD).toBe(12);
    expect(RATING_INITIAL_VISIBLE).toBe(10);
    expect(maxStarsForGroup(15)).toBe(30);
    expect(maxStarsForGroup(0)).toBe(0);
  });

  it('rankPlayers filters to active people and sorts by stars desc then roster order', () => {
    const people = [
      { id: 'p1', name: 'An', status: 'active', isMember: true, gender: 'M' as const, avatarUrl: null },
      { id: 'p2', name: 'Bình', status: 'active', isMember: false, gender: 'F' as const, avatarUrl: 'https://img/b.png' },
      { id: 'p3', name: 'Chi', status: 'left', isMember: false, gender: 'F' as const, avatarUrl: null },
      { id: 'p4', name: 'Dũng', status: 'pending', isMember: false, gender: 'M' as const, avatarUrl: null },
      { id: 'p5', name: 'Em', status: 'active', isMember: true, gender: 'M' as const, avatarUrl: null },
    ];
    const ranked = rankPlayers(people, { p1: 5, p2: 12, p3: 99, p4: 50, p5: 5 });
    expect(ranked.map((r) => [r.rank, r.id, r.stars])).toEqual([
      [1, 'p2', 12],
      [2, 'p1', 5],
      [3, 'p5', 5],
    ]);
  });

  it('rankPlayers puts players without stars last, sorted by name, with no rank', () => {
    const people = [
      { id: 'p1', name: 'Huyền', status: 'active', isMember: true },
      { id: 'p2', name: 'An', status: 'active', isMember: false },
      { id: 'p3', name: 'Bình', status: 'active', isMember: false },
      { id: 'p4', name: 'Thủy', status: 'active', isMember: true },
    ];
    const ranked = rankPlayers(people, { p4: 3 });
    expect(ranked.map((r) => [r.rank, r.id])).toEqual([
      [1, 'p4'],
      [null, 'p2'],
      [null, 'p3'],
      [null, 'p1'],
    ]);
  });

  it('ratingBudget computes remaining stars and over-budget deficit when roster shrinks', () => {
    expect(ratingBudget(10, { p2: 5, p3: 3 })).toEqual({
      maxStars: 20,
      spentStars: 8,
      remainingStars: 12,
      overBudgetBy: 0,
    });
    expect(ratingBudget(4, { p2: 5, p3: 5 })).toEqual({
      maxStars: 8,
      spentStars: 10,
      remainingStars: 0,
      overBudgetBy: 2,
    });
  });

  it('permissions: manage_ratings is admin-only; rate_player is active member-only', () => {
    const admin = { kind: 'member' as const, participantId: 'p1', participantPending: false, isOrganiser: false, isAdmin: true };
    const organiser = { kind: 'member' as const, participantId: 'p0', participantPending: false, isOrganiser: true, isAdmin: false };
    const member = { kind: 'member' as const, participantId: 'p2', participantPending: false, isOrganiser: false, isAdmin: false };
    const pendingMember = { kind: 'member' as const, participantId: 'p2', participantPending: true, isOrganiser: false, isAdmin: false };
    const guest = { kind: 'guest' as const, participantId: 'p3', participantPending: false, isOrganiser: false };
    const viewer = { kind: 'viewer' as const, participantId: null, participantPending: false, isOrganiser: false };

    expect(can(admin, 'manage_ratings')).toBe(true);
    expect(can(organiser, 'manage_ratings')).toBe(true);
    expect(can(member, 'manage_ratings')).toBe(false);
    expect(can(guest, 'manage_ratings')).toBe(false);

    expect(can(admin, 'rate_player')).toBe(true);
    expect(can(organiser, 'rate_player')).toBe(true);
    expect(can(member, 'rate_player')).toBe(true);
    expect(can(pendingMember, 'rate_player')).toBe(false);
    expect(can(guest, 'rate_player')).toBe(false);
    expect(can(viewer, 'rate_player')).toBe(false);
  });
});
