import { describe, expect, it } from 'vitest';
import {
  REPORT_SEGMENT_MAX,
  groupReportSegments,
  reportSegmentColor,
} from '../CategoryPiesCard';

describe('reportSegmentColor', () => {
  it('returns distinct theme accent chart tokens for indices 0..3', () => {
    const colors = [0, 1, 2, 3].map((idx) => reportSegmentColor(idx));
    expect(colors).toEqual([
      'var(--chart-1)',
      'var(--chart-2)',
      'var(--chart-3)',
      'var(--chart-4)',
    ]);
    expect(new Set(colors).size).toBe(REPORT_SEGMENT_MAX);
  });

  it('returns var(--chart-other) for indices 4 and beyond', () => {
    expect(reportSegmentColor(4)).toBe('var(--chart-other)');
    expect(reportSegmentColor(10)).toBe('var(--chart-other)');
  });
});

describe('groupReportSegments', () => {
  const makeItems = (amounts: number[]) =>
    amounts.map((amount, idx) => ({
      categoryId: `cat-${idx + 1}`,
      amount,
    }));

  it('returns [] for an empty list', () => {
    expect(groupReportSegments([])).toEqual([]);
  });

  it('keeps all items in order when there are 3 items', () => {
    const result = groupReportSegments(makeItems([500, 300, 100]));
    expect(result).toEqual([
      { key: 'cat-1', amount: 500, color: 'var(--chart-1)' },
      { key: 'cat-2', amount: 300, color: 'var(--chart-2)' },
      { key: 'cat-3', amount: 100, color: 'var(--chart-3)' },
    ]);
  });

  it('keeps all items in order without an other segment when there are 4 items', () => {
    const result = groupReportSegments(makeItems([500, 300, 200, 100]));
    expect(result).toHaveLength(4);
    expect(result).toEqual([
      { key: 'cat-1', amount: 500, color: 'var(--chart-1)' },
      { key: 'cat-2', amount: 300, color: 'var(--chart-2)' },
      { key: 'cat-3', amount: 200, color: 'var(--chart-3)' },
      { key: 'cat-4', amount: 100, color: 'var(--chart-4)' },
    ]);
  });

  it('groups items beyond 4 into a single other segment with summed amount', () => {
    const result = groupReportSegments(
      makeItems([700, 600, 500, 400, 300, 200, 100]),
    );
    expect(result).toHaveLength(5);
    expect(result).toEqual([
      { key: 'cat-1', amount: 700, color: 'var(--chart-1)' },
      { key: 'cat-2', amount: 600, color: 'var(--chart-2)' },
      { key: 'cat-3', amount: 500, color: 'var(--chart-3)' },
      { key: 'cat-4', amount: 400, color: 'var(--chart-4)' },
      { key: 'other', amount: 600, color: 'var(--chart-other)' },
    ]);
  });
});
