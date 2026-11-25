import { useId, type KeyboardEvent, type RefObject } from 'react';
import { CURRENCIES, type CurrencyCode } from '@cc/core';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { cn } from '@cc/web-ui/lib/utils';

const OPERATOR_SPLIT_RE = /([+\-\u2212])/;

function parseTermMinor(term: string, decimals: 0 | 2): number | null {
  if (decimals === 0) {
    if (!/^\d+$/.test(term)) return null;
    const value = Number(term);
    return Number.isSafeInteger(value) ? value : null;
  }
  const match = /^(\d+)(?:,(\d{1,2}))?$/.exec(term);
  if (!match) return null;
  const whole = Number(match[1]);
  const frac = Number((match[2] ?? '').padEnd(2, '0'));
  const minor = whole * 100 + frac;
  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * Evaluates an amount expression (e.g. '120000+35000' or '10,00−2,50')
 * into minor units (VND whole đồng; USD/USDT cents), or null if invalid, <= 0, or above max.
 */
export function evaluateAmountExpression(expr: string, code: CurrencyCode): number | null {
  if (!expr) return null;
  const info = CURRENCIES[code];
  const parts = expr.split(OPERATOR_SPLIT_RE);
  if (parts.length % 2 === 0) return null;

  const first = parseTermMinor(parts[0] ?? '', info.decimals);
  if (first === null) return null;

  let total = first;
  for (let i = 1; i < parts.length; i += 2) {
    const op = parts[i];
    const rhs = parseTermMinor(parts[i + 1] ?? '', info.decimals);
    if (rhs === null) return null;
    total = op === '+' ? total + rhs : total - rhs;
    if (!Number.isSafeInteger(total)) return null;
  }

  if (total <= 0 || total > info.max) return null;
  return total;
}

/** Formats a minor-unit amount back into keypad/field input form. */
export function formatKeypadValue(minor: number, code: CurrencyCode): string {
  if (CURRENCIES[code].decimals === 0) return String(Math.trunc(minor));
  const abs = Math.abs(Math.trunc(minor));
  return `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** Strips characters not accepted by the keypad for the given currency (including '.' thousands separators for VND). */
export function sanitizeAmountInput(raw: string, code: CurrencyCode): string {
  const allowsDecimal = CURRENCIES[code].decimals > 0;
  return raw.replace(allowsDecimal ? /[^0-9,+\-\u2212]/g : /[^0-9+\-\u2212]/g, '');
}

export interface AmountFieldProps {
  label: string;
  value: string;
  currency: CurrencyCode;
  tone?: 'neutral' | 'success' | 'danger';
  onChange(next: string): void;
  onDone?(minor: number): void;
  onFocus?(): void;
  inputRef?: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  testId?: string;
  inputTestId?: string;
  /** Fixed id for the input (e.g. a form's existing `#expense-amount`); a generated one otherwise. */
  inputId?: string;
  /** Custom parser (e.g. the group form's "180k" / "1,5tr" shorthand); defaults to the keypad expression rules. */
  parseValue?(value: string): number | null;
  /** Custom input filter paired with `parseValue`; defaults to the keypad's allowed characters. */
  sanitizeValue?(raw: string): string;
}

/** Text-input amount box for mouse-pointer (PC) devices, sharing keypad parsing rules. */
export function AmountField({
  label,
  value,
  currency,
  tone = 'neutral',
  onChange,
  onDone,
  onFocus,
  inputRef,
  disabled = false,
  testId,
  inputTestId,
  inputId: inputIdProp,
  parseValue,
  sanitizeValue,
}: AmountFieldProps) {
  const generatedId = useId();
  const inputId = inputIdProp ?? generatedId;
  const evaluated = parseValue ? parseValue(value) : evaluateAmountExpression(value, currency);
  const isInvalid = value.length > 0 && evaluated === null;
  const symbol = CURRENCIES[currency].symbol;
  const toneClass =
    tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-foreground';

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (evaluated !== null) {
        const formatted = formatKeypadValue(evaluated, currency);
        if (formatted !== value) {
          onChange(formatted);
        }
        onDone?.(evaluated);
      }
    }
  };

  const handleBlur = () => {
    if (evaluated !== null) {
      const formatted = formatKeypadValue(evaluated, currency);
      if (formatted !== value) {
        onChange(formatted);
      }
    }
  };

  return (
    <div
      data-testid={testId}
      className={cn(
        'w-full rounded-xl bg-card border border-transparent px-4 py-3 flex items-center justify-between gap-3 min-h-16 transition-colors',
        'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        isInvalid &&
          'border-destructive ring-[3px] ring-destructive/20 focus-within:border-destructive focus-within:ring-destructive/20',
      )}
    >
      <Label
        htmlFor={inputId}
        className="text-sm font-medium text-muted-foreground shrink-0 cursor-pointer"
      >
        {label}
      </Label>
      <div className="flex items-baseline justify-end gap-1 flex-1 min-w-0">
        <Input
          id={inputId}
          ref={inputRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={label}
          aria-invalid={isInvalid || undefined}
          data-testid={inputTestId}
          disabled={disabled}
          value={value}
          placeholder="0"
          onFocus={onFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onChange={(e) => {
            const next = sanitizeValue ? sanitizeValue(e.target.value) : sanitizeAmountInput(e.target.value, currency);
            if (next !== value) onChange(next);
          }}
          className={cn(
            'h-11 min-h-11 border-0 shadow-none bg-transparent px-0 py-0 text-right text-2xl font-bold tabular-nums focus-visible:ring-0 focus-visible:border-transparent aria-invalid:ring-0 aria-invalid:border-transparent placeholder:text-muted-foreground placeholder:font-medium',
            value ? toneClass : 'text-foreground',
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            'text-2xl font-bold tabular-nums shrink-0 select-none',
            value ? toneClass : 'text-muted-foreground font-medium',
          )}
        >
          {symbol}
        </span>
      </div>
    </div>
  );
}
