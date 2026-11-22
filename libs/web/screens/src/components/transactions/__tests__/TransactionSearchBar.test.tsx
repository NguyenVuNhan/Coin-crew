import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TagView } from '@cc/core';
import { setLang } from '@cc/web-i18n';
import {
  TransactionSearchBar,
  type TransactionSearchBarProps,
} from '../TransactionSearchBar';

const TAGS: TagView[] = [
  { id: 't-an', name: 'ăn uống', useCount: 5 },
  { id: 't-cafe', name: 'cà phê', useCount: 3 },
  { id: 't-di-lai', name: 'đi lại', useCount: 2 },
];

function renderBar(overrides: Partial<TransactionSearchBarProps> = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn();
  const onOpenAdvanced = overrides.onOpenAdvanced ?? vi.fn();
  const props: TransactionSearchBarProps = {
    q: undefined,
    tagId: undefined,
    tags: TAGS,
    advancedCount: 0,
    onSubmit,
    onOpenAdvanced,
    ...overrides,
  };
  const result = render(<TransactionSearchBar {...props} />);
  return { ...result, onSubmit, onOpenAdvanced, props };
}

beforeEach(() => {
  setLang('en');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TransactionSearchBar', () => {
  it('typing does not submit; the search button submits the trimmed text', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar();
    const input = screen.getByTestId('tx-filter-search');

    await user.type(input, '  lunch  ');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('tx-search-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ q: 'lunch', tagId: undefined });
  });

  it('Enter submits when no list is open', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar();
    const input = screen.getByTestId('tx-filter-search');

    await user.type(input, 'groceries{Enter}');
    expect(onSubmit).toHaveBeenCalledWith({ q: 'groceries', tagId: undefined });
  });

  it('typing #an lists #ăn uống and Enter picks it', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar();
    const input = screen.getByTestId('tx-filter-search');

    await user.type(input, '#an');
    expect(screen.getByTestId('tx-tag-suggestions')).toBeInTheDocument();
    expect(screen.getByTestId('tx-tag-option-t-an')).toHaveTextContent('#ăn uống');

    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith({ q: undefined, tagId: 't-an' });
    expect(input).toHaveValue('');
  });

  it('picking in "cà phê #an" keeps "cà phê"', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar();
    const input = screen.getByTestId('tx-filter-search');

    await user.type(input, 'cà phê #an');
    await user.click(screen.getByTestId('tx-tag-option-t-an'));

    expect(onSubmit).toHaveBeenCalledWith({ q: 'cà phê', tagId: 't-an' });
    expect(input).toHaveValue('cà phê');
  });

  it('ArrowDown then Enter picks the second suggestion', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar();
    const input = screen.getByTestId('tx-filter-search');

    await user.type(input, '#');
    expect(screen.getByTestId('tx-tag-option-t-an')).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('tx-tag-option-t-cafe')).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith({ q: undefined, tagId: 't-cafe' });
  });

  it('Escape closes the list so Enter submits the text', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar();
    const input = screen.getByTestId('tx-filter-search');

    await user.type(input, '#an');
    expect(screen.getByTestId('tx-tag-suggestions')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('tx-tag-suggestions')).not.toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith({ q: '#an', tagId: undefined });
  });

  it('no match shows the empty line, and no tags shows no list', async () => {
    const user = userEvent.setup();
    const { unmount } = renderBar();
    const input = screen.getByTestId('tx-filter-search');

    await user.type(input, '#zzz');
    expect(screen.getByTestId('tx-tag-suggestions')).toHaveTextContent('No matching tags');
    unmount();

    renderBar({ tags: [] });
    await user.type(screen.getByTestId('tx-filter-search'), '#an');
    expect(screen.queryByTestId('tx-tag-suggestions')).not.toBeInTheDocument();
  });

  it('Backspace in an empty box removes the chip', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar({ tagId: 't-an' });
    const input = screen.getByTestId('tx-filter-search');

    await user.click(input);
    await user.keyboard('{Backspace}');
    expect(onSubmit).toHaveBeenCalledWith({ q: undefined, tagId: undefined });
  });

  it('clear × empties and submits without q', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar({ q: 'coffee', tagId: 't-cafe' });

    await user.click(screen.getByTestId('tx-search-clear'));
    expect(screen.getByTestId('tx-filter-search')).toHaveValue('');
    expect(onSubmit).toHaveBeenCalledWith({ q: undefined, tagId: 't-cafe' });
  });

  it('shows q and the chip from props, and updates when q changes', () => {
    const draftRef = createRef<{ text: string }>();
    const onSubmit = vi.fn();
    const onOpenAdvanced = vi.fn();
    const { rerender } = render(
      <TransactionSearchBar
        q="bún chả"
        tagId="t-an"
        tags={TAGS}
        advancedCount={0}
        onSubmit={onSubmit}
        onOpenAdvanced={onOpenAdvanced}
        draftRef={draftRef}
      />,
    );

    expect(screen.getByTestId('tx-filter-search')).toHaveValue('bún chả');
    expect(screen.getByTestId('tx-search-tag-chip')).toHaveTextContent('#ăn uống');
    expect(draftRef.current?.text).toBe('bún chả');

    rerender(
      <TransactionSearchBar
        q="phở bò"
        tagId="t-cafe"
        tags={TAGS}
        advancedCount={0}
        onSubmit={onSubmit}
        onOpenAdvanced={onOpenAdvanced}
        draftRef={draftRef}
      />,
    );

    expect(screen.getByTestId('tx-filter-search')).toHaveValue('phở bò');
    expect(screen.getByTestId('tx-search-tag-chip')).toHaveTextContent('#cà phê');
    expect(draftRef.current?.text).toBe('phở bò');
  });

  it('a missing tag id shows the raw id and × removes it', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBar({ q: 'tea', tagId: 'deleted-tag-99' });

    const chip = screen.getByTestId('tx-search-tag-chip');
    expect(chip).toHaveTextContent('#deleted-tag-99');

    await user.click(chip);
    expect(onSubmit).toHaveBeenCalledWith({ q: 'tea', tagId: undefined });
  });

  it('the count badge shows advancedCount and opens advanced filters', async () => {
    const user = userEvent.setup();
    const onOpenAdvanced = vi.fn();
    const { rerender } = render(
      <TransactionSearchBar
        q={undefined}
        tagId={undefined}
        tags={TAGS}
        advancedCount={0}
        onSubmit={vi.fn()}
        onOpenAdvanced={onOpenAdvanced}
      />,
    );

    expect(screen.queryByTestId('tx-filter-count')).not.toBeInTheDocument();

    rerender(
      <TransactionSearchBar
        q={undefined}
        tagId={undefined}
        tags={TAGS}
        advancedCount={3}
        onSubmit={vi.fn()}
        onOpenAdvanced={onOpenAdvanced}
      />,
    );

    expect(screen.getByTestId('tx-filter-count')).toHaveTextContent('3');
    await user.click(screen.getByTestId('tx-filter-btn'));
    expect(onOpenAdvanced).toHaveBeenCalledTimes(1);
  });

  it('liveSearch debounces submission after typing stops and pauses while typing #tag', () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    render(
      <TransactionSearchBar
        q={undefined}
        tagId={undefined}
        tags={TAGS}
        advancedCount={0}
        liveSearch
        onSubmit={onSubmit}
        onOpenAdvanced={vi.fn()}
      />,
    );

    const input = screen.getByTestId('tx-filter-search');
    fireEvent.change(input, { target: { value: 'pho', selectionStart: 3 } });
    expect(onSubmit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onSubmit).toHaveBeenCalledWith({ q: 'pho', tagId: undefined });

    onSubmit.mockClear();
    fireEvent.change(input, { target: { value: 'pho #an', selectionStart: 7 } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
