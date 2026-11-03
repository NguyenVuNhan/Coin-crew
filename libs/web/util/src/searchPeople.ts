import { normalizeName, type MergeCandidate } from '@cc/core';

/**
 * Filters merge candidates by name, nickname, sign-in label (email / Zalo name) and group name,
 * ignoring case and Vietnamese diacritics. Keeps the input order (similar names first). An empty
 * query returns the list unchanged.
 */
export function searchPeople(candidates: MergeCandidate[], query: string): MergeCandidate[] {
  const q = normalizeName(query);
  if (q === '') return candidates;
  return candidates.filter((c) =>
    [c.name, c.nickname, c.signIn?.label, ...c.groups.map((g) => g.tripName)]
      .some((field) => field != null && normalizeName(field).includes(q)),
  );
}
