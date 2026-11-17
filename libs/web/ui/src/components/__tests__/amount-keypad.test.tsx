import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CURRENCIES, type CurrencyCode } from '@cc/core';
// @ts-expect-error -- Windows case-insensitive FS resolves extensionless ../AmountKeypad to amountKeypad.ts
import { AmountKeypad } from '../AmountKeypad.tsx';
import { amountSuggestions, evaluateAmountExpression } from '../amountKeypad';

function KeypadHarness({
  initial = '',
  currency = 'VND',
  onDone = vi.fn(),
}: {
  initial?: string;
  currency?: CurrencyCode;
  onDone?: (minor: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <output data-testid="expr-value">{value}</output>
      <AmountKeypad
        value={value}
        currency={currency}
        onChange={setValue}
        onDone={onDone}
        doneLabel="Xong"
        deleteLabel="Xóa"
      />
    </div>
  );
}

describe('evaluateAmountExpression', () => {
  it('evaluates VND addition', () => {
    expect(evaluateAmountExpression('120000+35000', 'VND')).toBe(155000);
  });

  it('evaluates USD decimal with comma', () => {
    expect(evaluateAmountExpression('12,5', 'USD')).toBe(1250);
  });

  it('evaluates USD subtraction with U+2212 minus', () => {
    expect(evaluateAmountExpression('10,00−2,50', 'USD')).toBe(750);
  });

  it('returns null when USD has more than 2 decimal digits', () => {
    expect(evaluateAmountExpression('12,345', 'USD')).toBeNull();
  });

  it('returns null for zero, negative result, empty, or over max', () => {
    expect(evaluateAmountExpression('0', 'VND')).toBeNull();
    expect(evaluateAmountExpression('5−9', 'VND')).toBeNull();
    expect(evaluateAmountExpression('', 'VND')).toBeNull();
    expect(evaluateAmountExpression(String(CURRENCIES.VND.max + 1), 'VND')).toBeNull();
    expect(evaluateAmountExpression('100000001', 'USD')).toBeNull();
  });

  it('returns null for VND with comma', () => {
    expect(evaluateAmountExpression('12,5', 'VND')).toBeNull();
  });
});

describe('amountSuggestions', () => {
  it('scales VND digits by 1000, 10000, 100000', () => {
    expect(amountSuggestions('85', 'VND')).toEqual([85000, 850000, 8500000]);
  });

  it('scales USDT digits by 100 and 1000 in cents', () => {
    expect(amountSuggestions('85', 'USDT')).toEqual([8500, 85000]);
  });

  it('returns empty array for expressions with operators, decimals, empty, or zero', () => {
    expect(amountSuggestions('85+1', 'VND')).toEqual([]);
    expect(amountSuggestions('12,5', 'USD')).toEqual([]);
    expect(amountSuggestions('', 'VND')).toEqual([]);
    expect(amountSuggestions('0', 'VND')).toEqual([]);
  });

  it('drops suggestions above currency max', () => {
    // Step A: typed numbers >= 1000 (VND) get no suggestions at all.
    expect(amountSuggestions('100000000', 'VND')).toEqual([]);
  });
});

describe('AmountKeypad', () => {
  it('never renders an <input>', () => {
    const { container } = render(<KeypadHarness />);
    expect(container.querySelector('input')).toBeNull();
  });

  it('typing 8 5 then tapping a suggestion sets value to 85000', () => {
    render(<KeypadHarness />);
    fireEvent.click(screen.getByTestId('key-8'));
    fireEvent.click(screen.getByTestId('key-5'));
    const suggestions = screen.getAllByTestId('amount-suggestion');
    expect(suggestions).toHaveLength(3);
    fireEvent.click(suggestions[0]!);
    expect(screen.getByTestId('expr-value')).toHaveTextContent('85000');
  });

  it('tapping a USD suggestion formats value as whole,cents', () => {
    render(<KeypadHarness currency="USD" />);
    fireEvent.click(screen.getByTestId('key-8'));
    fireEvent.click(screen.getByTestId('key-5'));
    const suggestions = screen.getAllByTestId('amount-suggestion');
    expect(suggestions).toHaveLength(2);
    fireEvent.click(suggestions[0]!);
    expect(screen.getByTestId('expr-value')).toHaveTextContent('85,00');
  });

  it('disables comma key for VND and enables it for USD', () => {
    const { unmount } = render(<KeypadHarness currency="VND" />);
    expect(screen.getByTestId('key-comma')).toBeDisabled();
    unmount();

    render(<KeypadHarness currency="USD" />);
    expect(screen.getByTestId('key-comma')).toBeEnabled();
  });
});
