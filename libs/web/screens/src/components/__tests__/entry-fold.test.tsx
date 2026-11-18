import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useEntryFold } from '../entryFold';
import { FoldLine } from '../FoldLine';

describe('useEntryFold', () => {
  it('keeps all parts open when enabled is false', () => {
    const { result } = renderHook(() => useEntryFold({ enabled: false, isEdit: false }));
    expect(result.current.isOpen('amount')).toBe(true);
    expect(result.current.isOpen('category')).toBe(true);
    expect(result.current.isOpen('details')).toBe(true);

    act(() => {
      result.current.finish('amount');
      result.current.finish('category');
    });
    expect(result.current.isOpen('amount')).toBe(true);
    expect(result.current.isOpen('category')).toBe(true);
    expect(result.current.isOpen('details')).toBe(true);
  });

  it('starts a new entry with only amount open when enabled is true', () => {
    const { result } = renderHook(() => useEntryFold({ enabled: true, isEdit: false }));
    expect(result.current.isOpen('amount')).toBe(true);
    expect(result.current.isOpen('category')).toBe(false);
    expect(result.current.isOpen('details')).toBe(false);
  });

  it('folds amount and opens category on finish("amount")', () => {
    const { result } = renderHook(() => useEntryFold({ enabled: true, isEdit: false }));
    act(() => {
      result.current.finish('amount');
    });
    expect(result.current.isOpen('amount')).toBe(false);
    expect(result.current.isOpen('category')).toBe(true);
    expect(result.current.isOpen('details')).toBe(false);
  });

  it('folds category on finish("category") without opening details', () => {
    const { result } = renderHook(() => useEntryFold({ enabled: true, isEdit: false }));
    act(() => {
      result.current.finish('amount');
    });
    act(() => {
      result.current.finish('category');
    });
    expect(result.current.isOpen('category')).toBe(false);
    expect(result.current.isOpen('details')).toBe(false);
  });

  it('starts an edit with only details open when enabled is true', () => {
    const { result } = renderHook(() => useEntryFold({ enabled: true, isEdit: true }));
    expect(result.current.isOpen('amount')).toBe(false);
    expect(result.current.isOpen('category')).toBe(false);
    expect(result.current.isOpen('details')).toBe(true);
  });

  it('reopens amount via open("amount") and leaves category state alone', () => {
    const { result } = renderHook(() => useEntryFold({ enabled: true, isEdit: false }));
    act(() => {
      result.current.finish('amount');
    });
    expect(result.current.isOpen('amount')).toBe(false);
    expect(result.current.isOpen('category')).toBe(true);

    act(() => {
      result.current.open('amount');
    });
    expect(result.current.isOpen('amount')).toBe(true);
    expect(result.current.isOpen('category')).toBe(true);
  });

  it('opens details only via open("details")', () => {
    const { result } = renderHook(() => useEntryFold({ enabled: true, isEdit: false }));
    act(() => {
      result.current.open('details');
    });
    expect(result.current.isOpen('details')).toBe(true);
  });
});

describe('FoldLine', () => {
  it('renders a button with data-testid, aria-expanded="false", muted label, children on the right, and fires onOpen on click', () => {
    const onOpen = vi.fn();
    render(
      <FoldLine testId="fold-amount" label="Số tiền" onOpen={onOpen}>
        <span>150.000₫</span>
      </FoldLine>,
    );

    const btn = screen.getByTestId('fold-amount');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('aria-expanded', 'false');

    const labelEl = screen.getByText('Số tiền');
    expect(labelEl).toHaveClass('text-muted-foreground');

    expect(btn).toHaveTextContent('150.000₫');

    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
