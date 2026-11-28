import { useRef, type JSX } from 'react';
import { useT } from '@cc/web-i18n';
import type { MessageKey } from '@cc/web-i18n/en';
import { Icon } from '@cc/web-ui/components/icons';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { cn } from '@cc/web-ui/lib/utils';

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(ymd: string): Date | null {
  const m = YMD_RE.exec(ymd);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function openPicker(el: HTMLInputElement | null): void {
  if (!el) return;
  try {
    if (typeof el.showPicker === 'function') {
      el.showPicker();
      return;
    }
  } catch {
    /* fall through to focus + click */
  }
  el.focus();
  el.click();
}

/** Formats a picked `YYYY-MM-DD` date as "T2, 10/2/2027" (vi) or "Mon, 10 Feb 2027" (en). */
export function formatPickedEventDate(ymd: string, t: ReturnType<typeof useT>): string {
  const parsed = parseDay(ymd);
  if (!parsed) return ymd;
  return t('events.pickedDate', {
    weekday: t(`events.wd.${parsed.getDay()}` as MessageKey),
    day: parsed.getDate(),
    month: t(`entryDate.mon.${parsed.getMonth()}` as MessageKey),
    year: parsed.getFullYear(),
  });
}

export interface EventDateRowProps {
  id: string;
  label: string;
  hint: string;
  value: string;
  emptyLabel: string;
  testId: string;
  disabled?: boolean;
  max?: string;
  quickToday?: string;
  allowClear?: boolean;
  onChange: (next: string) => void;
}

const chipClass =
  'min-h-11 px-3 inline-flex items-center rounded-full bg-muted text-xs font-semibold text-foreground border-0 cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors motion-reduce:transition-none';

/**
 * Date row matching the app's EntryDateRow tap-through pattern: readable localized date
 * ("T2, 10/2/2027" / "Mon, 10 Feb 2027"), quick action chips, and a transparent native date
 * input overlaid on the tap target so mobile pickers and automated tests work directly.
 */
export function EventDateRow({
  id,
  label,
  hint,
  value,
  emptyLabel,
  testId,
  disabled = false,
  max,
  quickToday,
  allowClear = false,
  onChange,
}: EventDateRowProps): JSX.Element {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const hasValue = YMD_RE.test(value);
  const displayText = hasValue ? formatPickedEventDate(value, t) : emptyLabel;

  return (
    <div className="w-full px-3.5 py-2.5 flex flex-col gap-1.5">
      <div className="min-h-11 flex items-center justify-between gap-3">
        <Label
          htmlFor={id}
          className="text-sm font-semibold text-foreground whitespace-nowrap shrink-0"
        >
          {label}
        </Label>

        <div className="flex items-center gap-1 shrink-0">
          <span className="relative inline-flex items-center">
            <button
              type="button"
              disabled={disabled}
              data-testid={`${testId}-display`}
              onClick={() => openPicker(inputRef.current)}
              className={cn(
                'min-h-11 px-2.5 inline-flex items-center rounded-xl bg-transparent border-0 text-sm font-semibold tabular-nums whitespace-nowrap',
                hasValue ? 'text-foreground' : 'text-muted-foreground',
                disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-muted',
              )}
            >
              {displayText}
            </button>
            <Input
              ref={inputRef}
              id={id}
              type="date"
              data-testid={testId}
              disabled={disabled}
              max={max}
              aria-label={label}
              tabIndex={-1}
              value={value}
              onClick={(e) => {
                if (disabled) return;
                try {
                  e.currentTarget.showPicker?.();
                } catch {
                  /* iOS opens it natively from the tap */
                }
              }}
              onChange={(e) => onChange(e.target.value)}
              className={cn(
                'absolute inset-0 h-full w-full min-w-0 opacity-0 appearance-none border-0 p-0 m-0 text-base shadow-none',
                disabled ? 'cursor-not-allowed pointer-events-none' : 'cursor-pointer',
              )}
            />
          </span>

          {allowClear && hasValue && !disabled && (
            <button
              type="button"
              data-testid={`${testId}-clear`}
              aria-label={t('events.clearDate')}
              onClick={() => onChange('')}
              className="size-11 inline-flex items-center justify-center rounded-full bg-transparent border-0 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
      </div>

      {!hasValue && hint && (
        <span data-testid={`${testId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      )}

      {!disabled && (
        <div className="flex items-center justify-end gap-2">
          {hasValue && quickToday && value !== quickToday && (
            <button
              type="button"
              data-testid={`${testId}-today`}
              onClick={() => onChange(quickToday)}
              className={chipClass}
            >
              {t('entryDate.today')}
            </button>
          )}
          <button
            type="button"
            data-testid={`${testId}-pick`}
            onClick={() => openPicker(inputRef.current)}
            className={chipClass}
          >
            {t('entryDate.chipPick')}
          </button>
        </div>
      )}
    </div>
  );
}
