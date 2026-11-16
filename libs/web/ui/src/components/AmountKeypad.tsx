import type { KeyboardEvent } from 'react';
import { Check, Delete } from 'lucide-react';
import { CURRENCIES, formatMoney, type CurrencyCode } from '@cc/core';
import { cn } from '../lib/utils';
import {
  amountSuggestions,
  applyKeypadComma,
  applyKeypadDigit,
  applyKeypadOperator,
  applyKeypadTripleZero,
  evaluateAmountExpression,
  formatKeypadValue,
} from './amountKeypad';

export interface AmountKeypadProps {
  value: string;
  currency: CurrencyCode;
  onChange(next: string): void;
  onDone(minor: number): void;
  doneLabel: string;
  deleteLabel?: string;
  className?: string;
}

const KEY_BASE =
  'min-h-12 rounded-xl text-lg font-semibold tabular-nums flex items-center justify-center transition-colors active:opacity-80 disabled:opacity-40 disabled:pointer-events-none select-none';
const KEY_CARD = `${KEY_BASE} bg-card text-foreground`;

export function AmountKeypad({
  value,
  currency,
  onChange,
  onDone,
  doneLabel,
  deleteLabel = 'Xóa',
  className,
}: AmountKeypadProps) {
  const allowsDecimal = CURRENCIES[currency].decimals > 0;
  const evaluated = evaluateAmountExpression(value, currency);
  const suggestions = amountSuggestions(value, currency);

  const handleDigit = (digit: string) => {
    onChange(applyKeypadDigit(value, digit));
  };

  const handleTripleZero = () => {
    const next = applyKeypadTripleZero(value);
    if (next !== value) onChange(next);
  };

  const handleOperator = (op: '+' | '−') => {
    const next = applyKeypadOperator(value, op);
    if (next !== value) onChange(next);
  };

  const handleComma = () => {
    if (!allowsDecimal) return;
    const next = applyKeypadComma(value, currency);
    if (next !== value) onChange(next);
  };

  const handleBackspace = () => {
    if (value.length > 0) onChange(value.slice(0, -1));
  };

  const handleDone = () => {
    if (evaluated !== null) onDone(evaluated);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      handleDigit(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
    } else if (e.key === '+') {
      e.preventDefault();
      handleOperator('+');
    } else if (e.key === '-' || e.key === '−') {
      e.preventDefault();
      handleOperator('−');
    } else if (e.key === ',') {
      e.preventDefault();
      handleComma();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleDone();
    }
  };

  return (
    <div
      data-testid="amount-keypad"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn('bg-muted p-2 rounded-2xl flex flex-col gap-2 outline-none', className)}
    >
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((minor) => (
            <button
              key={minor}
              type="button"
              data-testid="amount-suggestion"
              onClick={() => onChange(formatKeypadValue(minor, currency))}
              className="min-h-11 rounded-full bg-card text-foreground px-3.5 text-sm font-semibold tabular-nums transition-colors active:opacity-80"
            >
              {formatMoney(minor, currency)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        <button type="button" data-testid="key-7" className={KEY_CARD} onClick={() => handleDigit('7')}>
          7
        </button>
        <button type="button" data-testid="key-8" className={KEY_CARD} onClick={() => handleDigit('8')}>
          8
        </button>
        <button type="button" data-testid="key-9" className={KEY_CARD} onClick={() => handleDigit('9')}>
          9
        </button>
        <button
          type="button"
          data-testid="key-back"
          aria-label={deleteLabel}
          className={KEY_CARD}
          onClick={handleBackspace}
        >
          <Delete size={20} strokeWidth={2} aria-hidden="true" />
        </button>

        <button type="button" data-testid="key-4" className={KEY_CARD} onClick={() => handleDigit('4')}>
          4
        </button>
        <button type="button" data-testid="key-5" className={KEY_CARD} onClick={() => handleDigit('5')}>
          5
        </button>
        <button type="button" data-testid="key-6" className={KEY_CARD} onClick={() => handleDigit('6')}>
          6
        </button>
        <button
          type="button"
          data-testid="key-minus"
          className={KEY_CARD}
          onClick={() => handleOperator('−')}
        >
          −
        </button>

        <button type="button" data-testid="key-1" className={KEY_CARD} onClick={() => handleDigit('1')}>
          1
        </button>
        <button type="button" data-testid="key-2" className={KEY_CARD} onClick={() => handleDigit('2')}>
          2
        </button>
        <button type="button" data-testid="key-3" className={KEY_CARD} onClick={() => handleDigit('3')}>
          3
        </button>
        <button
          type="button"
          data-testid="key-plus"
          className={KEY_CARD}
          onClick={() => handleOperator('+')}
        >
          +
        </button>

        <button type="button" data-testid="key-000" className={KEY_CARD} onClick={handleTripleZero}>
          000
        </button>
        <button type="button" data-testid="key-0" className={KEY_CARD} onClick={() => handleDigit('0')}>
          0
        </button>
        <button
          type="button"
          data-testid="key-comma"
          disabled={!allowsDecimal}
          className={KEY_CARD}
          onClick={handleComma}
        >
          ,
        </button>
        <button
          type="button"
          data-testid="key-done"
          aria-label={doneLabel}
          disabled={evaluated === null}
          className={cn(KEY_BASE, 'bg-primary text-primary-foreground')}
          onClick={handleDone}
        >
          <Check size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
