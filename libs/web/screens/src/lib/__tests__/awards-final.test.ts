import { afterEach, describe, expect, it } from 'vitest';
import { newScore, type AttendancePerson, type AttendanceView } from '@cc/core';
import { setLang, t } from '@cc/web-i18n';
import { buildAwards } from '../awards';

afterEach(() => {
  setLang('vi', false);
});

const person = (
  id: string,
  over: Partial<ReturnType<typeof newScore>>,
  labels: AttendancePerson['labels'] = [],
  wantedStamp = false,
): AttendancePerson => ({
  participantId: id,
  score: { ...newScore(id), sessionsSeen: 8, sessionsPlanned: 8, ...over },
  labels,
  wantedStamp,
});

const people = [
  { id: 'p-reg', name: 'An' },
  { id: 'p-back', name: 'Chi' },
  { id: 'p-guest', name: 'Dũng' },
  { id: 'p-flaky', name: 'Bình' },
];

describe('awards final-review fixes', () => {
  it('flaky person with both streaks 0 gets no no-show award, board row, ticker line or Wanted entry', () => {
    const view: AttendanceView = {
      people: [
        person('p-reg', { presence: 85, presenceJoinStreak: 5 }, ['regular']),
        person(
          'p-flaky',
          { reliability: 40, reliabilitySkipStreak: 0, lastEndedNoShowStreak: 0 },
          ['flaky'],
          false,
        ),
      ],
      latestSession: { rootId: 'r-1', spentOn: '2026-11-15' },
      pendingSessions: 0,
    };

    const content = buildAwards(view, people, t);
    expect(content.awards).not.toBeNull();
    expect(content.awards!.awards.map((a) => a.kind)).toEqual(['regular']);
    expect(content.wantedCandidates).toEqual([]);
    expect(content.verse!.verses.map((v) => v.name)).toEqual(['An']);
    expect(content.board!.rows.some((r) => r.tone === 'cold')).toBe(false);
    expect(content.board!.ticker).not.toContain('BÌNH');
  });

  it('singular English copy uses "Missed 1 planned session" when reliabilitySkipStreak is 1', () => {
    setLang('en', false);
    const view: AttendanceView = {
      people: [
        person('p-reg', { presence: 85, presenceJoinStreak: 1 }, ['regular']),
        person('p-back', { presence: 25, lastBack: true, lastReturnGap: 1 }, ['back']),
        person('p-guest', { guest: 1.5, guestsTotal: 1 }, ['topGuest']),
        person('p-flaky', { reliability: 40, reliabilitySkipStreak: 1 }, ['flaky']),
      ],
      latestSession: { rootId: 'r-1', spentOn: '2026-11-15' },
      pendingSessions: 0,
    };

    const content = buildAwards(view, people, t);
    const noShowAward = content.awards!.awards.find((a) => a.kind === 'noShow')!;
    expect(noShowAward.stat).toBe('Missed 1 planned session');
    expect(content.wanted('p-flaky').crime).toBe('Crime: missed 1 planned session');
  });

  it('group with only a flaky person builds Wanted only and returns null for awards, verse and board', () => {
    const view: AttendanceView = {
      people: [person('p-flaky', { reliability: 35, reliabilitySkipStreak: 3 }, ['flaky'])],
      latestSession: { rootId: 'r-2', spentOn: '2026-11-15' },
      pendingSessions: 0,
    };

    const content = buildAwards(view, people, t);
    expect(content.awards).toBeNull();
    expect(content.verse).toBeNull();
    expect(content.board).toBeNull();
    expect(content.wantedCandidates).toEqual(['p-flaky']);
    expect(content.wanted('p-flaky').name).toBe('Bình');
  });

  it('person missing from view.people is dropped and never appears on any card or falls back to a raw id', () => {
    const view: AttendanceView = {
      people: [
        person('p-ghost-reg', { presence: 95, presenceJoinStreak: 10 }, ['regular']),
        person('p-ghost-back', { presence: 25, lastBack: true, lastReturnGap: 4 }, ['back']),
        person('p-ghost-guest', { guest: 5, guestsTotal: 8 }, ['topGuest']),
        person('p-ghost-flaky', { reliability: 30, reliabilitySkipStreak: 5 }, ['flaky'], true),
        person('p-reg', { presence: 80, presenceJoinStreak: 3 }, ['regular']),
      ],
      latestSession: { rootId: 'r-3', spentOn: '2026-11-15' },
      pendingSessions: 0,
    };

    const content = buildAwards(view, people, t);
    expect(content.awards!.awards.map((a) => a.name)).toEqual(['An']);
    expect(content.wantedCandidates).toEqual([]);
    expect(content.verse!.verses.map((v) => v.name)).toEqual(['An']);
    expect(content.board!.rows.map((r) => r.name)).toEqual(['An']);
    expect(content.board!.ticker).not.toContain('p-ghost');
    expect(content.wanted('p-ghost-flaky').name).toBe('');

    // When only ghost people exist in attendance, all cards and candidates are empty/null.
    const ghostOnly = buildAwards(
      {
        people: [
          person('p-ghost-reg', { presence: 95, presenceJoinStreak: 10 }, ['regular']),
          person('p-ghost-flaky', { reliability: 30, reliabilitySkipStreak: 5 }, ['flaky'], true),
        ],
        latestSession: { rootId: 'r-3', spentOn: '2026-11-15' },
        pendingSessions: 0,
      },
      people,
      t,
    );
    expect(ghostOnly.awards).toBeNull();
    expect(ghostOnly.verse).toBeNull();
    expect(ghostOnly.board).toBeNull();
    expect(ghostOnly.wantedCandidates).toEqual([]);
  });
});
