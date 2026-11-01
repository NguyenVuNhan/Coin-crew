import { normalizeName, type RecentPerson, type Gender } from '@fsl/core';
import { matchesWordStart } from './nameSearch';

/** One line of the "Who else is coming?" list. A `userId` makes it a picked account (a locked row). */
export type PersonEntry = { key: string; name: string; userId?: string; gender?: Gender | null };

let lastKey = 0;

/** A new line with a key that stays the same while the list changes around it. */
export function newPersonEntry(name = '', userId?: string, gender: Gender | null = null): PersonEntry {
  lastKey += 1;
  const entry: PersonEntry = { key: `person-${lastKey}`, name };
  if (userId !== undefined) entry.userId = userId;
  if (gender !== undefined) entry.gender = gender;
  return entry;
}

export function nextGender(current: Gender | null | undefined): Gender | null {
  if (current === 'M') return 'F';
  if (current === 'F') return null;
  return 'M';
}

/**
 * Up to `max` people whose name has a word that starts with what was typed, ignoring accents and capitals.
 * A query of several words ("chi tr") matches from the start of any word of the name. Accounts in `exclude` are skipped.
 */
export function filterRecentPeople(query: string, people: RecentPerson[], exclude: Set<string>, max = 5): RecentPerson[] {
  const q = normalizeName(query);
  if (!q) return [];
  const found: RecentPerson[] = [];
  for (const person of people) {
    if (exclude.has(person.userId)) continue;
    if (matchesWordStart(query, person.name)) {
      found.push(person);
      if (found.length >= max) break;
    }
  }
  return found;
}
