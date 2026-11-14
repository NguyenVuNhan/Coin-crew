import type { AttendancePerson, AttendanceView } from '@cc/core';
import type { MessageKey } from '@cc/web-i18n/en';
import type { MemeAward, MemeInput } from '@cc/web-util/memeCards';
import { formatDay } from '@cc/web-util/time';

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export interface AwardsContent {
  awards: (MemeInput & { kind: 'awards' }) | null;
  wantedCandidates: string[];
  wanted(participantId: string): MemeInput & { kind: 'wanted' };
  verse: (MemeInput & { kind: 'verse' }) | null;
  board: (MemeInput & { kind: 'board' }) | null;
}

/** Two-letter avatar initials: the start of the given name (the last word in a Vietnamese name). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/);
  return Array.from(words[words.length - 1] ?? '')
    .slice(0, 2)
    .join('');
}

function givenNameOf(name: string): string {
  const words = name.trim().split(/\s+/);
  return words[words.length - 1] || name;
}

/** Stable index in `0..poolSize - 1`, rotating as `seed` (latest rootId) changes. */
export function pickVerse(kind: 'regular' | 'back' | 'noShow', seed: string, poolSize: number): number {
  if (poolSize <= 1) return 0;
  const key = `${kind}:${seed}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 32 + key.charCodeAt(i)) >>> 0;
  }
  return h % poolSize;
}

function cmpRegular(a: AttendancePerson, b: AttendancePerson): number {
  if (b.score.presence !== a.score.presence) return b.score.presence - a.score.presence;
  if (b.score.presenceJoinStreak !== a.score.presenceJoinStreak) {
    return b.score.presenceJoinStreak - a.score.presenceJoinStreak;
  }
  if (b.score.timesPlayed !== a.score.timesPlayed) return b.score.timesPlayed - a.score.timesPlayed;
  return a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
}

function cmpBack(a: AttendancePerson, b: AttendancePerson): number {
  if (b.score.lastReturnGap !== a.score.lastReturnGap) return b.score.lastReturnGap - a.score.lastReturnGap;
  if (b.score.presence !== a.score.presence) return b.score.presence - a.score.presence;
  return a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
}

function cmpGuest(a: AttendancePerson, b: AttendancePerson): number {
  if (b.score.guest !== a.score.guest) return b.score.guest - a.score.guest;
  if (b.score.guestsTotal !== a.score.guestsTotal) return b.score.guestsTotal - a.score.guestsTotal;
  return a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
}

function cmpNoShow(a: AttendancePerson, b: AttendancePerson): number {
  if (b.score.reliabilitySkipStreak !== a.score.reliabilitySkipStreak) {
    return b.score.reliabilitySkipStreak - a.score.reliabilitySkipStreak;
  }
  if (a.score.reliability !== b.score.reliability) return a.score.reliability - b.score.reliability;
  return a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
}

export function buildAwards(
  view: AttendanceView,
  people: { id: string; name: string; avatarUrl?: string | null }[],
  t: Translate,
  tripName = '',
): AwardsContent {
  const nameMap = new Map(people.filter((p) => p.name).map((p) => [p.id, p.name]));
  const avatarMap = new Map(people.map((p) => [p.id, p.avatarUrl ?? null]));
  const nameOf = (id: string) => nameMap.get(id) ?? '';
  const scored = Array.isArray(view.people)
    ? view.people.filter((p) => p?.score && Array.isArray(p.labels) && nameMap.has(p.participantId))
    : [];

  const regulars = scored.filter((p) => p.labels.includes('regular')).sort(cmpRegular);
  const backs = scored.filter((p) => p.labels.includes('back')).sort(cmpBack);
  const guests = scored.filter((p) => p.labels.includes('topGuest')).sort(cmpGuest);
  const flakies = scored
    .filter((p) => p.labels.includes('flaky') && p.score.reliabilitySkipStreak >= 1)
    .sort(cmpNoShow);

  const regularWinner = regulars[0] ?? null;
  const backWinner = backs[0] ?? null;
  const guestWinner = guests[0] ?? null;
  const noShowWinner = flakies[0] ?? null;

  const awardItems: MemeAward[] = [];
  if (regularWinner) {
    const streak = regularWinner.score.presenceJoinStreak;
    const played = regularWinner.score.timesPlayed;
    awardItems.push({
      kind: 'regular',
      title: t('awards.title.regular'),
      name: nameOf(regularWinner.participantId),
      stat:
        streak > 0
          ? t(streak === 1 ? 'awards.stat.regular_one' : 'awards.stat.regular', { n: streak })
          : t(played === 1 ? 'awards.stat.regularPlayed_one' : 'awards.stat.regularPlayed', { n: played }),
    });
  }
  if (backWinner) {
    const gap = backWinner.score.lastReturnGap;
    awardItems.push({
      kind: 'back',
      title: t('awards.title.back'),
      name: nameOf(backWinner.participantId),
      stat: t(gap === 1 ? 'awards.stat.back_one' : 'awards.stat.back', { n: gap }),
    });
  }
  if (guestWinner) {
    const total = guestWinner.score.guestsTotal;
    awardItems.push({
      kind: 'guest',
      title: t('awards.title.guest'),
      name: nameOf(guestWinner.participantId),
      stat: t(total === 1 ? 'awards.stat.guest_one' : 'awards.stat.guest', { n: total }),
    });
  }
  if (noShowWinner) {
    const streak = noShowWinner.score.reliabilitySkipStreak;
    awardItems.push({
      kind: 'noShow',
      title: t('awards.title.noShow'),
      name: nameOf(noShowWinner.participantId),
      stat: t(streak === 1 ? 'awards.stat.noShow_one' : 'awards.stat.noShow', { n: streak }),
    });
  }

  const footer = t('awards.footer');
  const sessionDate = view.latestSession?.spentOn ? formatDay(view.latestSession.spentOn) : null;
  const hasPraise = Boolean(regularWinner || backWinner || guestWinner);

  const awards: (MemeInput & { kind: 'awards' }) | null =
    hasPraise && awardItems.length > 0
      ? {
          kind: 'awards',
          heading: t('awards.heading'),
          subheading: sessionDate
            ? t('awards.subheadingDate', { date: sessionDate })
            : t('awards.subheading'),
          awards: awardItems,
          footer,
        }
      : null;

  const wantedCandidates = scored
    .filter((p) => (p.labels.includes('flaky') && p.score.reliabilitySkipStreak >= 1) || p.wantedStamp)
    .map((p) => p.participantId);

  const wanted = (participantId: string): MemeInput & { kind: 'wanted' } => {
    const person = scored.find((p) => p.participantId === participantId);
    const name = nameOf(participantId);
    const streak = person?.wantedStamp
      ? person.score.lastEndedNoShowStreak
      : (person?.score.reliabilitySkipStreak ?? 0);
    const lastSeen = person?.score.lastPlayedOn
      ? t('awards.wanted.lastSeen', { date: formatDay(person.score.lastPlayedOn) })
      : t('awards.wanted.neverSeen');

    return {
      kind: 'wanted',
      heading: t('awards.wanted.heading'),
      group: tripName || t('awards.subheading'),
      name,
      initials: initialsOf(name),
      avatarUrl: avatarMap.get(participantId) ?? null,
      crime: t(streak === 1 ? 'awards.wanted.crime_one' : 'awards.wanted.crime', { n: streak }),
      lastSeen,
      reward: t('awards.wanted.reward'),
      stamp: person?.wantedStamp ? t('awards.wanted.stamp') : null,
      footer,
    };
  };

  const seed = view.latestSession?.rootId ?? 'default';
  const verseItems: { line6: string; line8: string; name: string; tag: string }[] = [];
  const verseKey = (kind: 'regular' | 'back' | 'noShow', idx: 1 | 2 | 3): MessageKey =>
    `awards.verse.${kind}.${idx}`;
  const verseTagKey = (kind: 'regular' | 'back' | 'noShow'): MessageKey => `awards.verse.tag.${kind}`;
  const addVerse = (kind: 'regular' | 'back' | 'noShow', winner: AttendancePerson | null) => {
    if (!winner) return;
    const given = givenNameOf(nameOf(winner.participantId));
    const idx = ((pickVerse(kind, seed, 3) % 3) + 1) as 1 | 2 | 3;
    const raw = t(verseKey(kind, idx), { name: given });
    const [line6 = '', line8 = ''] = raw.split('\n');
    const tag = t(verseTagKey(kind));
    verseItems.push({ line6, line8, name: given, tag });
  };
  addVerse('regular', regularWinner);
  addVerse('back', backWinner);
  addVerse('noShow', noShowWinner);

  const hasPraiseVerse = Boolean(regularWinner || backWinner);
  const verse: (MemeInput & { kind: 'verse' }) | null =
    hasPraise && hasPraiseVerse && verseItems.length > 0
      ? {
          kind: 'verse',
          heading: t('awards.verse.heading'),
          month: sessionDate ?? t('awards.verse.month'),
          verses: verseItems,
          seal: t('awards.verse.seal'),
          footer,
        }
      : null;

  const boardRows: { label: string; name: string; value: number; tone: 'hot' | 'plain' | 'cold' }[] = [];
  for (const r of regulars.filter((p) => p.score.presenceJoinStreak > 0).slice(0, 2)) {
    boardRows.push({
      label: t('awards.board.joinStreak'),
      name: nameOf(r.participantId),
      value: r.score.presenceJoinStreak,
      tone: 'hot',
    });
  }
  if (backWinner) {
    boardRows.push({
      label: t('awards.board.comeback'),
      name: nameOf(backWinner.participantId),
      value: backWinner.score.lastReturnGap,
      tone: 'plain',
    });
  }
  if (guestWinner) {
    boardRows.push({
      label: t('awards.board.guests'),
      name: nameOf(guestWinner.participantId),
      value: guestWinner.score.guestsTotal,
      tone: 'plain',
    });
  }
  if (noShowWinner) {
    boardRows.push({
      label: t('awards.board.noShowStreak'),
      name: nameOf(noShowWinner.participantId),
      value: noShowWinner.score.reliabilitySkipStreak,
      tone: 'cold',
    });
  }

  const tickerParts: string[] = [];
  if (backWinner) {
    const gap = backWinner.score.lastReturnGap;
    tickerParts.push(
      t(gap === 1 ? 'awards.board.tickerBack_one' : 'awards.board.tickerBack', {
        name: nameOf(backWinner.participantId).toUpperCase(),
        n: gap,
      }),
    );
  }
  if (regularWinner && regularWinner.score.presenceJoinStreak > 0) {
    tickerParts.push(
      t('awards.board.tickerRegular', {
        name: nameOf(regularWinner.participantId).toUpperCase(),
        n: regularWinner.score.presenceJoinStreak,
      }),
    );
  }
  if (guestWinner) {
    const total = guestWinner.score.guestsTotal;
    tickerParts.push(
      t(total === 1 ? 'awards.board.tickerGuest_one' : 'awards.board.tickerGuest', {
        name: nameOf(guestWinner.participantId).toUpperCase(),
        n: total,
      }),
    );
  }
  if (noShowWinner) {
    tickerParts.push(
      t('awards.board.tickerNoShow', {
        name: nameOf(noShowWinner.participantId).toUpperCase(),
      }),
    );
  }

  const hasPraiseRow = boardRows.some((r) => r.tone !== 'cold');
  const board: (MemeInput & { kind: 'board' }) | null =
    hasPraise && hasPraiseRow
      ? {
          kind: 'board',
          heading: t('awards.board.heading'),
          subheading: sessionDate
            ? t('awards.board.subheadingDate', { date: sessionDate })
            : t('awards.board.subheading'),
          rows: boardRows.slice(0, 5),
          ticker: tickerParts.join(' · '),
          footer,
        }
      : null;

  return {
    awards,
    wantedCandidates,
    wanted,
    verse,
    board,
  };
}
