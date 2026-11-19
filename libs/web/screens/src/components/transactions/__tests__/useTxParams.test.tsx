import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { currentMonthLocal } from '@cc/web-util/localDate';
import { useTxParams } from '../useTxParams';

type TxParamsApi = ReturnType<typeof useTxParams>;

function mountTxParams(initialEntry: string) {
  let latest!: TxParamsApi;

  function Harness() {
    latest = useTxParams();
    const location = useLocation();
    return <span data-testid="search">{location.search}</span>;
  }

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Harness />
    </MemoryRouter>,
  );

  return {
    get current() {
      return latest;
    },
    getSearch() {
      return screen.getByTestId('search').textContent ?? '';
    },
  };
}

describe('useTxParams', () => {
  it('parses all params and ignores an unknown type', () => {
    const valid = mountTxParams(
      '/transactions?month=2026-10&walletId=w-1&categoryId=c-2&assetId=a-3&tagId=t-4&type=expense&q=coffee&from=2026-10-01&to=2026-10-15',
    );
    expect(valid.current.month).toBe('2026-10');
    expect(valid.current.filters).toEqual({
      walletId: 'w-1',
      categoryId: 'c-2',
      assetId: 'a-3',
      tagId: 't-4',
      type: 'expense',
      q: 'coffee',
      from: '2026-10-01',
      to: '2026-10-15',
    });
    expect(valid.current.hasRange).toBe(true);
    expect(valid.current.hasAnyFilter).toBe(true);

    const unknownType = mountTxParams('/transactions?type=bogus');
    expect(unknownType.current.month).toBe(currentMonthLocal());
    expect(unknownType.current.filters.type).toBeUndefined();
    expect(unknownType.current.hasRange).toBe(false);
    expect(unknownType.current.hasAnyFilter).toBe(false);
  });

  it('set merges and removes empty keys', () => {
    const state = mountTxParams(
      '/transactions?month=2026-09&walletId=w-1&q=tea&type=expense',
    );

    act(() => {
      state.current.set({ q: '', walletId: undefined, categoryId: 'c-5' });
    });

    expect(state.current.month).toBe('2026-09');
    expect(state.current.filters).toEqual({
      walletId: undefined,
      categoryId: 'c-5',
      assetId: undefined,
      tagId: undefined,
      type: 'expense',
      q: undefined,
      from: undefined,
      to: undefined,
    });
    const params = new URLSearchParams(state.getSearch());
    expect(params.get('month')).toBe('2026-09');
    expect(params.get('categoryId')).toBe('c-5');
    expect(params.get('type')).toBe('expense');
    expect(params.has('q')).toBe(false);
    expect(params.has('walletId')).toBe(false);
  });

  it('set with replaceFilters replaces filters while keeping month unless given', () => {
    const state = mountTxParams(
      '/transactions?month=2026-09&walletId=w-1&q=tea&type=expense',
    );

    act(() => {
      state.current.set({ categoryId: 'c-5' }, { replaceFilters: true });
    });

    expect(state.current.month).toBe('2026-09');
    expect(state.current.filters).toEqual({
      walletId: undefined,
      categoryId: 'c-5',
      assetId: undefined,
      tagId: undefined,
      type: undefined,
      q: undefined,
      from: undefined,
      to: undefined,
    });

    act(() => {
      state.current.set(
        { month: '2026-11', q: 'pho' },
        { replaceFilters: true },
      );
    });

    expect(state.current.month).toBe('2026-11');
    expect(state.current.filters.categoryId).toBeUndefined();
    expect(state.current.filters.q).toBe('pho');
  });

  it('clearAll keeps month', () => {
    const state = mountTxParams(
      '/transactions?month=2026-08&walletId=w-1&q=lunch&from=2026-08-01',
    );

    act(() => {
      state.current.clearAll();
    });

    expect(state.current.month).toBe('2026-08');
    expect(state.current.hasAnyFilter).toBe(false);
    expect(state.getSearch()).toBe('?month=2026-08');
  });

  it('isSearching is true for q or tagId', () => {
    const none = mountTxParams('/transactions?walletId=w-1');
    expect(none.current.isSearching).toBe(false);

    const withQ = mountTxParams('/transactions?q=rent');
    expect(withQ.current.isSearching).toBe(true);

    const withTag = mountTxParams('/transactions?tagId=t-1');
    expect(withTag.current.isSearching).toBe(true);
  });

  it('advancedCount counts type, wallet, category, asset', () => {
    const zero = mountTxParams('/transactions?q=rent&tagId=t-1&from=2026-01-01');
    expect(zero.current.advancedCount).toBe(0);

    const two = mountTxParams('/transactions?type=income&walletId=w-1&q=salary');
    expect(two.current.advancedCount).toBe(2);

    const four = mountTxParams(
      '/transactions?type=trade&walletId=w-1&categoryId=c-1&assetId=a-1',
    );
    expect(four.current.advancedCount).toBe(4);
  });
});
