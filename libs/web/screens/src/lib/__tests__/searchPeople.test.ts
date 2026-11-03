import { describe, it, expect } from 'vitest';
import type { MergeCandidate } from '@cc/core';
import { searchPeople } from '../searchPeople';

const cand = (over: Partial<MergeCandidate> & { key: MergeCandidate['key']; name: string }): MergeCandidate => ({
  nickname: null,
  avatarUrl: null,
  signIn: null,
  groups: [],
  similar: false,
  plan: { ok: true, tag: 'link', steps: [{ kind: 'link' }] },
  ...over,
});

const list = [
  cand({ key: 'u:u-1', name: 'Minh Nguyễn', signIn: { provider: 'google', label: 'minh.ng@gmail.com' } }),
  cand({ key: 'p:p-2', name: 'MINH' }),
  cand({ key: 'p:p-3', name: 'Mai', groups: [{ tripId: 't-dl', tripName: 'Đà Lạt', kind: 'group' }] }),
  cand({ key: 'p:p-4', name: 'Noah', nickname: 'Bé Na' }),
];

describe('searchPeople', () => {
  it('matches without diacritics or case', () => {
    expect(searchPeople(list, 'minh').map((c) => c.key)).toEqual(['u:u-1', 'p:p-2']);
    expect(searchPeople(list, 'nguyen').map((c) => c.key)).toEqual(['u:u-1']);
  });

  it('matches group name, email and nickname', () => {
    expect(searchPeople(list, 'da lat').map((c) => c.key)).toEqual(['p:p-3']);
    expect(searchPeople(list, 'ng@gmail').map((c) => c.key)).toEqual(['u:u-1']);
    expect(searchPeople(list, 'be na').map((c) => c.key)).toEqual(['p:p-4']);
  });

  it('returns everyone for an empty query', () => {
    expect(searchPeople(list, '   ')).toBe(list);
  });
});
