import { describe, it, expect } from 'vitest';
import type { RecentPerson } from '@fsl/core';
import { filterRecentPeople } from '../recentPeople';

const person = (userId: string, name: string, trips: string[] = ['Phú Quốc']): RecentPerson => ({ userId, name, trips });

const people = [person('u-pheo', 'Chí Phèo'), person('u-chi', 'Chi Trần'), person('u-binh', 'Bình'), person('u-thao', 'Nguyễn Thị Thảo')];

describe('filterRecentPeople', () => {
  it('matches names without accents or capitals, by word', () => {
    expect(filterRecentPeople('chi', people, new Set()).map((p) => p.userId)).toEqual(['u-pheo', 'u-chi']);
    expect(filterRecentPeople('CHÍ', people, new Set()).map((p) => p.userId)).toEqual(['u-pheo', 'u-chi']);
    expect(filterRecentPeople('tran', people, new Set()).map((p) => p.userId)).toEqual(['u-chi']);
    expect(filterRecentPeople('thao', people, new Set()).map((p) => p.userId)).toEqual(['u-thao']);
    expect(filterRecentPeople('hi', people, new Set())).toEqual([]);
    expect(filterRecentPeople('', people, new Set())).toEqual([]);
    expect(filterRecentPeople('   ', people, new Set())).toEqual([]);
  });

  it('keeps matching once the query has more than one word', () => {
    expect(filterRecentPeople('chi tr', people, new Set()).map((p) => p.userId)).toEqual(['u-chi']);
    expect(filterRecentPeople('Chi Trần ', people, new Set()).map((p) => p.userId)).toEqual(['u-chi']);
    expect(filterRecentPeople('tran chi', people, new Set())).toEqual([]);
  });

  it('skips accounts that are already on the list and stops at the limit', () => {
    expect(filterRecentPeople('chi', people, new Set(['u-chi'])).map((p) => p.userId)).toEqual(['u-pheo']);
    const many = Array.from({ length: 12 }, (_, i) => person(`u-${i}`, `Chi ${i}`));
    expect(filterRecentPeople('chi', many, new Set())).toHaveLength(5);
    expect(filterRecentPeople('chi', many, new Set(), 2).map((p) => p.userId)).toEqual(['u-0', 'u-1']);
  });
});
