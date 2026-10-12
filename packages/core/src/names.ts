export type MatchReason = 'same' | 'typo' | 'part';
export interface NameCandidate { id: string; name: string }

export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isOneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) === 1;
}

function isPart(a: string, b: string): boolean {
  if (a === b) return false;
  const [short, long] = a.split(' ').length <= b.split(' ').length ? [a, b] : [b, a];
  const longWords = new Set(long.split(' '));
  return short.split(' ').every((w) => longWords.has(w));
}

const RANK: Record<MatchReason, number> = { same: 0, typo: 1, part: 2 };

export function findSimilarNames(input: string, existing: NameCandidate[]): (NameCandidate & { reason: MatchReason })[] {
  const n = normalizeName(input);
  if (!n) return [];
  const matches: (NameCandidate & { reason: MatchReason })[] = [];
  for (const c of existing) {
    const m = normalizeName(c.name);
    const reason: MatchReason | null =
      m === n ? 'same' : n.length >= 3 && m.length >= 3 && isOneEditApart(n, m) ? 'typo' : isPart(n, m) ? 'part' : null;
    if (reason) matches.push({ id: c.id, name: c.name, reason });
  }
  return matches.sort((x, y) => RANK[x.reason] - RANK[y.reason]);
}

export function suggestNames(prefix: string, existing: NameCandidate[]): NameCandidate[] {
  const p = normalizeName(prefix);
  if (!p) return [];
  return existing.filter((c) => normalizeName(c.name).split(' ').some((w) => w.startsWith(p)));
}
