import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CurrencyCode } from '@cc/core';
// @ts-expect-error -- Windows case-insensitive FS resolves extensionless ../AmountKeypad to amountKeypad.ts
import { AmountKeypad } from '../AmountKeypad.tsx';

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
        doneLabel="Lưu"
        deleteLabel="Xóa"
      />
    </div>
  );
}

describe('AmountKeypad R3 (no −/+ keys)', () => {
  it('omits key-minus and key-plus and keeps all remaining key testids', () => {
    render(<KeypadHarness />);

    expect(screen.queryByTestId('key-minus')).toBeNull();
    expect(screen.queryByTestId('key-plus')).toBeNull();

    for (const id of [
      'key-7',
      'key-8',
      'key-9',
      'key-back',
      'key-4',
      'key-5',
      'key-6',
      'key-comma',
      'key-1',
      'key-2',
      'key-3',
      'key-000',
      'key-0',
      'key-done',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it('ignores + and - keyboard presses', () => {
    render(<KeypadHarness initial="10" />);
    const keypad = screen.getByTestId('amount-keypad');
    fireEvent.keyDown(keypad, { key: '+' });
    fireEvent.keyDown(keypad, { key: '-' });
    fireEvent.keyDown(keypad, { key: '−' });
    expect(screen.getByTestId('expr-value')).toHaveTextContent('10');
  });

  it('enters digits, 000, and calls onDone with minor units', () => {
    const onDone = vi.fn();
    render(<KeypadHarness onDone={onDone} />);

    fireEvent.click(screen.getByTestId('key-5'));
    fireEvent.click(screen.getByTestId('key-000'));
    expect(screen.getByTestId('expr-value')).toHaveTextContent('5000');

    fireEvent.click(screen.getByTestId('key-done'));
    expect(onDone).toHaveBeenCalledWith(5000);
  });
});
