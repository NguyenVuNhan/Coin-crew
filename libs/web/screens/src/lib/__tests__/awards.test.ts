import { describe, expect, it } from 'vitest';
import { newScore, type AttendancePerson, type AttendanceView } from '@cc/core';
import { t } from '@cc/web-i18n';
import { buildAwards, pickVerse } from '../awards';

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
  { id: 'p-reg-1', name: 'An' },
  { id: 'p-reg-2', name: 'Giang' },
  { id: 'p-back', name: 'Chi' },
  { id: 'p-guest', name: 'Dũng' },
  { id: 'p-flaky-1', name: 'Bình' },
  { id: 'p-flaky-2', name: 'Hải' },
];

describe('buildAwards and pickVerse', () => {
  it('buildAwards orders praise first and noShow last; drops missing awards', () => {
    const fullView: AttendanceView = {
      people: [
        person('p-flaky-1', { reliability: 35, reliabilitySkipStreak: 2 }, ['flaky']),
        person('p-flaky-2', { reliability: 30, reliabilitySkipStreak: 4 }, ['flaky']),
        person('p-reg-1', { presence: 88, presenceJoinStreak: 5 }, ['regular']),
        person('p-reg-2', { presence: 88, presenceJoinStreak: 12 }, ['regular']),
        person('p-back', { presence: 32, lastBack: true, lastReturnGap: 6 }, ['back']),
        person('p-guest', { guest: 3.2, guestsTotal: 9 }, ['topGuest']),
      ],
      latestSession: { rootId: 'r-10', spentOn: '2026-11-15' },
      pendingSessions: 1,
    };

    const content = buildAwards(fullView, people, t);
    expect(content.awards).not.toBeNull();
    expect(content.awards!.awards.map((a) => a.kind)).toEqual(['regular', 'back', 'guest', 'noShow']);
    // Ties on regular presence go to longer join streak (Giang = 12 vs An = 5).
    expect(content.awards!.awards[0]!.name).toBe('Giang');
    expect(content.awards!.awards[1]!.name).toBe('Chi');
    expect(content.awards!.awards[1]!.stat).toContain('6');
    expect(content.awards!.awards[2]!.name).toBe('Dũng');
    expect(content.awards!.awards[2]!.stat).toContain('9');
    // Longest reliabilitySkipStreak wins noShow (Hải = 4 vs Bình = 2), always placed last.
    expect(content.awards!.awards[3]!.name).toBe('Hải');

    // Drops missing awards when only regular and noShow exist.
    const partialView: AttendanceView = {
      people: [
        person('p-flaky-1', { reliability: 35, reliabilitySkipStreak: 3 }, ['flaky']),
        person('p-reg-1', { presence: 85, presenceJoinStreak: 7 }, ['regular']),
      ],
      latestSession: { rootId: 'r-10', spentOn: '2026-11-15' },
      pendingSessions: 0,
    };
    const partial = buildAwards(partialView, people, t);
    expect(partial.awards!.awards.map((a) => a.kind)).toEqual(['regular', 'noShow']);

    // Returns null for awards when none qualify.
    const emptyAwards = buildAwards({ people: [], latestSession: null, pendingSessions: 0 }, people, t);
    expect(emptyAwards.awards).toBeNull();
    expect(emptyAwards.verse).toBeNull();
    expect(emptyAwards.board).toBeNull();
  });

  it('wanted candidates lists flaky people and shows the stamp variant when wantedStamp', () => {
    const view: AttendanceView = {
      people: [
        person('p-reg-1', { presence: 85 }, ['regular']),
        person('p-flaky-1', { reliability: 40, reliabilitySkipStreak: 3, lastPlayedOn: '2026-10-18' }, ['flaky'], false),
        person('p-flaky-2', { reliability: 45, reliabilitySkipStreak: 0, lastEndedNoShowStreak: 2, lastPlayedOn: '2026-11-15' }, ['flaky'], true),
      ],
      latestSession: { rootId: 'r-11', spentOn: '2026-11-15' },
      pendingSessions: 0,
    };

    const content = buildAwards(view, people, t, 'Cầu lông Thứ Bảy');
    expect(content.wantedCandidates).toEqual(['p-flaky-1', 'p-flaky-2']);

    const unstamped = content.wanted('p-flaky-1');
    expect(unstamped.name).toBe('Bình');
    expect(unstamped.group).toBe('Cầu lông Thứ Bảy');
    expect(unstamped.stamp).toBeNull();
    expect(unstamped.crime).toContain('3');

    const stamped = content.wanted('p-flaky-2');
    expect(stamped.name).toBe('Hải');
    expect(stamped.stamp).not.toBeNull();
    expect(stamped.stamp).toMatch(/ĐÃ RA SÂN|BACK ON COURT/i);
  });

  it('uses regularPlayed stat when presenceJoinStreak is 0 and given name in verses', () => {
    const view: AttendanceView = {
      people: [
        person('p-reg-1', { presence: 85, presenceJoinStreak: 0, timesPlayed: 7 }, ['regular']),
      ],
      latestSession: { rootId: 'r-12', spentOn: '2026-11-15' },
      pendingSessions: 0,
    };
    const fullNamePeople = [{ id: 'p-reg-1', name: 'Nguyễn Văn Minh' }];
    const content = buildAwards(view, fullNamePeople, t, 'Sân Cầu Lông');
    expect(content.awards!.awards[0]!.stat).toMatch(/7 buổi đã chơi|7 sessions played/);
    expect(content.verse!.verses[0]!.name).toBe('Minh');
    expect(content.verse!.verses[0]!.line8).toContain('Minh');
    expect(content.verse!.verses[0]!.line8).not.toContain('Nguyễn');
    expect(content.board).toBeNull();
  });

  it('board skips regulars whose presenceJoinStreak is 0', () => {
    const view: AttendanceView = {
      people: [
        person('p-reg-1', { presence: 85, presenceJoinStreak: 0 }, ['regular']),
        person('p-back', { presence: 30, lastBack: true, lastReturnGap: 5 }, ['back']),
      ],
      latestSession: { rootId: 'r-13', spentOn: '2026-11-15' },
      pendingSessions: 0,
    };
    const content = buildAwards(view, people, t);
    expect(content.board).not.toBeNull();
    expect(content.board!.rows.some((r) => r.label === t('awards.board.joinStreak'))).toBe(false);
    expect(content.board!.rows.some((r) => r.label === t('awards.board.comeback'))).toBe(true);
  });

  it('pickVerse is stable for a seed and changes with it', () => {
    const first = pickVerse('regular', 'root-1', 3);
    const again = pickVerse('regular', 'root-1', 3);
    expect(first).toBe(again);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(3);

    const next = pickVerse('regular', 'root-2', 3);
    expect(next).not.toBe(first);
  });
});
