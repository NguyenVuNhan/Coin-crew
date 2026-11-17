import { useRef, type JSX } from 'react';
import { useT } from '@cc/web-i18n';
import type { MessageKey } from '@cc/web-i18n/en';
import { Input } from '@cc/web-ui/components/ui/input';
import { todayLocal } from '@cc/web-util/localDate';

export interface EntryDateRowProps {
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:MM`, or null when there is no time. */
  time: string | null;
  onChange(next: { date: string; time: string | null }): void;
  showTime?: boolean;
  /** Injected "now" for tests; defaults to the current time. */
  now?: Date;
}

function parseDay(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function shiftDay(now: Date, days: number): string {
  return todayLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
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

/**
 * A transparent native input laid over a tap target. iOS Safari opens a date/time picker only
 * when the tap lands on a real, visible-sized input (showPicker()/click() on a hidden one does
 * nothing), so pointer taps go straight to this input. Keyboard and screen-reader users keep the
 * button underneath (this overlay is aria-hidden and out of the tab order).
 */
function PickerOverlay({
  type,
  testId,
  value,
  onValue,
}: {
  type: 'date' | 'time';
  testId: string;
  value: string;
  onValue(next: string): void;
}): JSX.Element {
  return (
    <Input
      type={type}
      data-testid={testId}
      aria-hidden="true"
      tabIndex={-1}
      value={value}
      onClick={(e) => {
        // Desktop Chrome only opens the picker from its icon; open it from anywhere on the target.
        try {
          e.currentTarget.showPicker?.();
        } catch {
          /* iOS opens it natively from the tap */
        }
      }}
      onChange={(e) => {
        if (e.target.value) onValue(e.target.value);
      }}
      className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0 appearance-none border-0 p-0 m-0 text-base shadow-none"
    />
  );
}

const chipClass =
  'min-h-11 px-3 inline-flex items-center rounded-full bg-muted text-sm font-semibold text-foreground border-0 cursor-pointer';

/** One compact "Ngày" row: readable value, a yesterday chip, and native pickers kept out of sight. */
export function EntryDateRow({ date, time, onChange, showTime = true, now }: EntryDateRowProps): JSX.Element {
  const t = useT();
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);

  const current = now ?? new Date();
  const today = todayLocal(current);
  const yesterday = shiftDay(current, -1);

  const parsed = parseDay(date);
  let dayText: string;
  if (date === today) dayText = t('entryDate.today');
  else if (date === yesterday) dayText = t('entryDate.yesterday');
  else if (parsed) {
    const sameYear = parsed.getFullYear() === current.getFullYear();
    dayText = t(sameYear ? 'entryDate.dayFormat' : 'entryDate.dayFormatYear', {
      weekday: t(`entryDate.wd.${parsed.getDay()}` as MessageKey),
      day: parsed.getDate(),
      month: t(`entryDate.mon.${parsed.getMonth()}` as MessageKey),
      year: parsed.getFullYear(),
    });
  } else dayText = date;

  const shownTime = showTime && time ? time : null;
  const isYesterday = date === yesterday;

  return (
    <div className="w-full px-4 py-2 flex flex-col gap-1" data-testid="entry-date-row">
      <div className="min-h-11 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground shrink-0">{t('personalEntry.date')}</span>
        <span className="flex items-center justify-end min-w-0 text-base font-medium text-foreground">
          <span className="relative inline-flex">
            <button
              type="button"
              data-testid="entry-date-value"
              aria-label={t('entryDate.rowLabel', {
                value: shownTime ? t('entryDate.rowAria', { day: dayText, time: shownTime }) : dayText,
              })}
              onClick={() => openPicker(dateRef.current)}
              className="min-h-11 bg-transparent border-0 p-0 text-base font-medium text-foreground cursor-pointer"
            >
              {dayText}
            </button>
            <PickerOverlay
              type="date"
              testId="entry-date-overlay-value"
              value={date}
              onValue={(v) => onChange({ date: v, time })}
            />
          </span>
          {shownTime && (
            <>
              <span aria-hidden="true" className="mx-1 text-muted-foreground">
                {' · '}
              </span>
              <span className="relative inline-flex">
                <button
                  type="button"
                  data-testid="entry-time-value"
                  aria-label={t('entryDate.changeTime')}
                  onClick={() => openPicker(timeRef.current)}
                  className="min-h-11 bg-transparent border-0 p-0 text-base font-medium tabular-nums text-foreground cursor-pointer"
                >
                  {shownTime}
                </button>
                <PickerOverlay
                  type="time"
                  testId="entry-time-overlay-value"
                  value={time ?? ''}
                  onValue={(v) => onChange({ date, time: v.slice(0, 5) })}
                />
              </span>
            </>
          )}
        </span>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid="entry-date-chip-quick"
          onClick={() => onChange({ date: isYesterday ? today : yesterday, time })}
          className={chipClass}
        >
          {isYesterday ? t('entryDate.today') : t('entryDate.yesterday')}
        </button>
        <span className="relative inline-flex">
          <button
            type="button"
            data-testid="entry-date-chip-pick"
            onClick={() => openPicker(dateRef.current)}
            className={chipClass}
          >
            {t('entryDate.chipPick')}
          </button>
          <PickerOverlay
            type="date"
            testId="entry-date-overlay-chip"
            value={date}
            onValue={(v) => onChange({ date: v, time })}
          />
        </span>
      </div>

      <Input
        ref={dateRef}
        type="date"
        data-testid="entry-date-picker"
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only h-px w-px border-0 p-0"
        value={date}
        onChange={(e) => {
          if (e.target.value) onChange({ date: e.target.value, time });
        }}
      />
      {showTime && (
        <Input
          ref={timeRef}
          type="time"
          data-testid="entry-time-picker"
          aria-hidden="true"
          tabIndex={-1}
          className="sr-only h-px w-px border-0 p-0"
          value={time ?? ''}
          onChange={(e) => {
            if (e.target.value) onChange({ date, time: e.target.value.slice(0, 5) });
          }}
        />
      )}
    </div>
  );
}
