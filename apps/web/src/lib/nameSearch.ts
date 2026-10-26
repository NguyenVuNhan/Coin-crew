import { normalizeName } from '@fsl/core';

/** Matches the start of any word in a name, ignoring accents. */
export function matchesWordStart(query: string, name: string): boolean {
  const q = normalizeName(query);
  if (q === '') return true;
  return (' ' + normalizeName(name)).includes(' ' + q);
}
