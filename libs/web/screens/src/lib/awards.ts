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
  people: { id: string; name: string }[],
  t: Translate,
): AwardsContent {
  const nameMap = new Map(people.map((p) => [p.id, p.name]));
  const nameOf = (id: string) => nameMap.get(id) ?? id;
  const scored = Array.isArray(view.people) ? view.people.filter((p) => p?.score && Array.isArray(p.labels)) : [];

  const regulars = scored.filter((p) => p.labels.includes('regular')).sort(cmpRegular);
  const backs = scored.filter((p) => p.labels.includes('back')).sort(cmpBack);
  const guests = scored.filter((p) => p.labels.includes('topGuest')).sort(cmpGuest);
  const flakies = scored.filter((p) => p.labels.includes('flaky')).sort(cmpNoShow);

  const regularWinner = regulars[0] ?? null;
  const backWinner = backs[0] ?? null;
  const guestWinner = guests[0] ?? null;
  const noShowWinner = flakies[0] ?? null;

  const awardItems: MemeAward[] = [];
  if (regularWinner) {
    awardItems.push({
      kind: 'regular',
      title: t('awards.title.regular'),
      name: nameOf(regularWinner.participantId),
      stat: t('awards.stat.regular', {
        n: Math.max(1, regularWinner.score.presenceJoinStreak || regularWinner.score.timesPlayed),
      }),
    });
  }
  if (backWinner) {
    awardItems.push({
      kind: 'back',
      title: t('awards.title.back'),
      name: nameOf(backWinner.participantId),
      stat: t('awards.stat.back', { n: backWinner.score.lastReturnGap }),
    });
  }
  if (guestWinner) {
    awardItems.push({
      kind: 'guest',
      title: t('awards.title.guest'),
      name: nameOf(guestWinner.participantId),
      stat: t('awards.stat.guest', { n: guestWinner.score.guestsTotal }),
    });
  }
  if (noShowWinner) {
    const streak = noShowWinner.score.reliabilitySkipStreak || noShowWinner.score.lastEndedNoShowStreak || 1;
    awardItems.push({
      kind: 'noShow',
      title: t('awards.title.noShow'),
      name: nameOf(noShowWinner.participantId),
      stat: t('awards.stat.noShow', { n: streak }),
    });
  }

  const footer = t('awards.footer');
  const sessionDate = view.latestSession?.spentOn ? formatDay(view.latestSession.spentOn) : null;

  const awards: (MemeInput & { kind: 'awards' }) | null =
    awardItems.length > 0
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
    .filter((p) => p.labels.includes('flaky') || p.wantedStamp)
    .map((p) => p.participantId);

  const wanted = (participantId: string): MemeInput & { kind: 'wanted' } => {
    const person = scored.find((p) => p.participantId === participantId);
    const name = nameOf(participantId);
    const streak = person?.score.reliabilitySkipStreak || person?.score.lastEndedNoShowStreak || 1;
    const lastSeen = person?.score.lastPlayedOn
      ? t('awards.wanted.lastSeen', { date: formatDay(person.score.lastPlayedOn) })
      : t('awards.wanted.neverSeen');

    return {
      kind: 'wanted',
      heading: t('awards.wanted.heading'),
      group: t('awards.wanted.group'),
      name,
      initials: initialsOf(name),
      crime: t('awards.wanted.crime', { n: streak }),
      lastSeen,
      reward: t('awards.wanted.reward'),
      stamp: person?.wantedStamp ? t('awards.wanted.stamp') : null,
      footer,
    };
  };

  const seed = view.latestSession?.rootId ?? 'default';
  const verseItems: { line6: string; line8: string; name: string; tag: string }[] = [];
  const addVerse = (kind: 'regular' | 'back' | 'noShow', winner: AttendancePerson | null) => {
    if (!winner) return;
    const name = nameOf(winner.participantId);
    const idx = pickVerse(kind, seed, 3) + 1;
    const raw = t(`awards.verse.${kind}.${idx as 1 | 2 | 3}` as MessageKey, { name });
    const [line6 = '', line8 = ''] = raw.split('\n');
    const tag = t(`awards.verse.tag.${kind}` as MessageKey);
    verseItems.push({ line6, line8, name, tag });
  };
  addVerse('regular', regularWinner);
  addVerse('back', backWinner);
  addVerse('noShow', noShowWinner);

  const verse: (MemeInput & { kind: 'verse' }) | null =
    verseItems.length > 0
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
  for (const r of regulars.slice(0, 2)) {
    boardRows.push({
      label: t('awards.board.joinStreak'),
      name: nameOf(r.participantId),
      value: Math.max(1, r.score.presenceJoinStreak || r.score.timesPlayed),
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
      value: noShowWinner.score.reliabilitySkipStreak || noShowWinner.score.lastEndedNoShowStreak || 1,
      tone: 'cold',
    });
  }

  const tickerParts: string[] = [];
  if (backWinner) {
    tickerParts.push(
      t('awards.board.tickerBack', {
        name: nameOf(backWinner.participantId).toUpperCase(),
        n: backWinner.score.lastReturnGap,
      }),
    );
  }
  if (regularWinner) {
    tickerParts.push(
      t('awards.board.tickerRegular', {
        name: nameOf(regularWinner.participantId).toUpperCase(),
        n: Math.max(1, regularWinner.score.presenceJoinStreak || regularWinner.score.timesPlayed),
      }),
    );
  }
  if (guestWinner) {
    tickerParts.push(
      t('awards.board.tickerGuest', {
        name: nameOf(guestWinner.participantId).toUpperCase(),
        n: guestWinner.score.guestsTotal,
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

  const board: (MemeInput & { kind: 'board' }) | null =
    boardRows.length > 0
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
