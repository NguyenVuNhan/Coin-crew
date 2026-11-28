import { useMemo, useRef, useState, type JSX } from 'react';
import {
  nextOccurrenceAfter,
  type RecurringSchedule,
  type RepeatEnd,
  type RepeatUnit,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { Switch } from '@cc/web-ui/components/ui/switch';
import { cn } from '@cc/web-ui/lib/utils';
import {
  dayOfMonth,
  defaultMonthlySchedule,
  formatDayMonth,
  isLastDayOfMonth,
  isoWeekday,
  scheduleInWords,
  weekdayFullLabel,
  weekdayShortLabel,
} from '../lib/scheduleWords';

export interface RepeatValue {
  schedule: RecurringSchedule;
  askMe: boolean;
}

export interface RepeatFieldProps {
  /** Entry date (YYYY-MM-DD), used as startDate and for preset labels. */
  date: string;
  value: RepeatValue | null;
  onChange: (next: RepeatValue | null) => void;
  /** Asset buys force askMe on and disable the switch. */
  isBuy?: boolean;
  /** False in rule-edit mode so "Không lặp" is not offered. Defaults to true. */
  allowNone?: boolean;
}

type PresetId = 'none' | 'day' | 'week' | 'month' | 'year' | 'custom';

const UNITS: readonly RepeatUnit[] = ['day', 'week', 'month', 'year'];
const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

function detectActivePreset(
  value: RepeatValue | null,
  date: string,
  isBuy: boolean,
): PresetId {
  if (!value) return 'none';
  const { schedule, askMe } = value;
  if (!isBuy && askMe) return 'custom';
  if (schedule.every !== 1 || schedule.end.kind !== 'never') return 'custom';

  if (schedule.unit === 'day') return 'day';
  if (schedule.unit === 'week') {
    const wd = isoWeekday(date);
    const list = schedule.weekdays && schedule.weekdays.length > 0 ? schedule.weekdays : [wd];
    return list.length === 1 && list[0] === wd ? 'week' : 'custom';
  }
  if (schedule.unit === 'month') {
    const expected: number | 'last' = isLastDayOfMonth(date) ? 'last' : dayOfMonth(date);
    const actual = schedule.monthDay ?? dayOfMonth(schedule.startDate);
    return actual === expected ? 'month' : 'custom';
  }
  if (schedule.unit === 'year') {
    return formatDayMonth(schedule.startDate) === formatDayMonth(date) ? 'year' : 'custom';
  }
  return 'custom';
}

export function RepeatField({
  date,
  value,
  onChange,
  isBuy = false,
  allowNone = true,
}: RepeatFieldProps): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'presets' | 'custom'>('presets');

  // Custom editor draft state
  const [everyText, setEveryText] = useState('1');
  const [unit, setUnit] = useState<RepeatUnit>('month');
  const [weekdays, setWeekdays] = useState<number[]>([isoWeekday(date)]);
  const [monthDayMode, setMonthDayMode] = useState<'date' | 'last'>('date');
  const [customMonthDay, setCustomMonthDay] = useState<number>(dayOfMonth(date));
  const [endKind, setEndKind] = useState<RepeatEnd['kind']>('never');
  const [endDate, setEndDate] = useState<string>(date);
  const [endCountText, setEndCountText] = useState<string>('12');
  const [draftAskMe, setDraftAskMe] = useState<boolean>(isBuy);

  const countInputRef = useRef<HTMLInputElement>(null);

  const entryDay = dayOfMonth(date);
  const entryIsLastDay = isLastDayOfMonth(date);
  const entryWeekday = isoWeekday(date);

  const presets = useMemo(
    () => ({
      day: {
        unit: 'day' as const,
        every: 1,
        startDate: date,
        end: { kind: 'never' as const },
      },
      week: {
        unit: 'week' as const,
        every: 1,
        weekdays: [entryWeekday],
        startDate: date,
        end: { kind: 'never' as const },
      },
      month: defaultMonthlySchedule(date),
      year: {
        unit: 'year' as const,
        every: 1,
        startDate: date,
        end: { kind: 'never' as const },
      },
    }),
    [date, entryWeekday],
  );

  const activePreset = detectActivePreset(value, date, isBuy);

  const previewSchedule = value?.schedule ?? presets.month;
  const nextDate = useMemo(
    () => nextOccurrenceAfter(previewSchedule, date),
    [previewSchedule, date],
  );

  const handleOpen = () => {
    setView('presets');
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setView('presets');
  };

  const handlePickPreset = (preset: 'none' | 'day' | 'week' | 'month' | 'year') => {
    if (preset === 'none') {
      onChange(null);
      handleClose();
      return;
    }
    onChange({
      schedule: presets[preset],
      askMe: isBuy ? true : (value?.askMe ?? false),
    });
    handleClose();
  };

  const handleOpenCustom = () => {
    const base = value?.schedule ?? presets.month;
    setEveryText(String(Math.max(1, Math.trunc(base.every))));
    setUnit(base.unit);
    setWeekdays(
      base.weekdays && base.weekdays.length > 0 ? [...base.weekdays] : [entryWeekday],
    );
    if (base.monthDay === 'last') {
      setMonthDayMode('last');
      setCustomMonthDay(entryDay);
    } else {
      setMonthDayMode('date');
      setCustomMonthDay(
        typeof base.monthDay === 'number' ? base.monthDay : entryDay,
      );
    }
    setEndKind(base.end.kind);
    setEndDate(
      base.end.kind === 'date'
        ? base.end.date
        : (nextOccurrenceAfter(presets.month, date) ?? date),
    );
    setEndCountText(base.end.kind === 'count' ? String(base.end.count) : '12');
    setDraftAskMe(isBuy ? true : (value?.askMe ?? false));
    setView('custom');
  };

  const toggleWeekday = (wd: number) => {
    setWeekdays((prev) => {
      if (prev.includes(wd)) {
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item !== wd);
      }
      return [...prev, wd].sort((a, b) => a - b);
    });
  };

  const handleCustomDone = () => {
    const parsedEvery = Math.max(1, Math.trunc(Number(everyText)) || 1);
    const parsedCount = Math.max(1, Math.trunc(Number(endCountText)) || 1);

    let end: RepeatEnd;
    if (endKind === 'date') {
      end = { kind: 'date', date: endDate || date };
    } else if (endKind === 'count') {
      end = { kind: 'count', count: parsedCount };
    } else {
      end = { kind: 'never' };
    }

    const schedule: RecurringSchedule = {
      unit,
      every: parsedEvery,
      ...(unit === 'week'
        ? { weekdays: weekdays.length > 0 ? [...weekdays].sort((a, b) => a - b) : [entryWeekday] }
        : {}),
      ...(unit === 'month'
        ? { monthDay: monthDayMode === 'last' ? 'last' : customMonthDay }
        : {}),
      startDate: date,
      end,
    };

    onChange({
      schedule,
      askMe: isBuy ? true : draftAskMe,
    });
    handleClose();
  };

  const unitLabel = (u: RepeatUnit): string => {
    switch (u) {
      case 'day':
        return t('recurring.unitCapDay');
      case 'week':
        return t('recurring.unitCapWeek');
      case 'month':
        return t('recurring.unitCapMonth');
      case 'year':
        return t('recurring.unitCapYear');
    }
  };

  const monthlyPresetLabel = entryIsLastDay
    ? t('recurring.presetMonthlyLast')
    : t('recurring.presetMonthly', { day: entryDay });

  return (
    <>
      <button
        type="button"
        data-testid="entry-repeat"
        onClick={handleOpen}
        className="fsl-entry-repeat w-full min-h-11 px-4 py-3 flex items-center justify-between gap-3 bg-transparent border-x-0 border-t-0 text-left cursor-pointer hover:bg-muted/50"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground shrink-0">
          <Icon name="repeat" size={18} className="text-muted-foreground shrink-0" />
          <span>{t('recurring.repeatLabel')}</span>
        </span>
        <span className="flex items-center gap-1 text-base font-medium min-w-0">
          <span className={cn('truncate', value ? 'text-primary' : 'text-foreground')}>
            {value ? scheduleInWords(value.schedule, t) : t('recurring.repeatNone')}
          </span>
          <Icon name="chevronRight" size={18} className="text-muted-foreground shrink-0" />
        </span>
      </button>

      <Sheet
        open={open}
        onClose={handleClose}
        title={view === 'presets' ? t('recurring.repeatLabel') : t('recurring.customTitle')}
      >
        {view === 'presets' ? (
          <div className="flex flex-col gap-3 pb-2">
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {allowNone && (
                <button
                  type="button"
                  data-testid="repeat-option-none"
                  onClick={() => handlePickPreset('none')}
                  className={cn(
                    'w-full min-h-12 px-4 flex items-center justify-between gap-3 bg-transparent border-0 text-left text-base cursor-pointer hover:bg-muted/50',
                    activePreset === 'none' ? 'font-semibold text-foreground' : 'font-medium text-foreground',
                  )}
                >
                  <span>{t('recurring.repeatNone')}</span>
                  {activePreset === 'none' && (
                    <Icon name="check" size={18} className="text-primary shrink-0" />
                  )}
                </button>
              )}

              <button
                type="button"
                data-testid="repeat-option-day"
                onClick={() => handlePickPreset('day')}
                className={cn(
                  'w-full min-h-12 px-4 flex items-center justify-between gap-3 bg-transparent border-0 text-left text-base cursor-pointer hover:bg-muted/50',
                  activePreset === 'day' ? 'font-semibold text-foreground' : 'font-medium text-foreground',
                )}
              >
                <span>{t('recurring.schedule.daily')}</span>
                {activePreset === 'day' && (
                  <Icon name="check" size={18} className="text-primary shrink-0" />
                )}
              </button>

              <button
                type="button"
                data-testid="repeat-option-week"
                onClick={() => handlePickPreset('week')}
                className={cn(
                  'w-full min-h-12 px-4 flex items-center justify-between gap-3 bg-transparent border-0 text-left text-base cursor-pointer hover:bg-muted/50',
                  activePreset === 'week' ? 'font-semibold text-foreground' : 'font-medium text-foreground',
                )}
              >
                <span>
                  {t('recurring.schedule.weekly', {
                    days: weekdayFullLabel(entryWeekday, t),
                  })}
                </span>
                {activePreset === 'week' && (
                  <Icon name="check" size={18} className="text-primary shrink-0" />
                )}
              </button>

              <button
                type="button"
                data-testid="repeat-option-month"
                onClick={() => handlePickPreset('month')}
                className={cn(
                  'w-full min-h-12 px-4 flex items-center justify-between gap-3 bg-transparent border-0 text-left text-base cursor-pointer hover:bg-muted/50',
                  activePreset === 'month' ? 'font-semibold text-foreground' : 'font-medium text-foreground',
                )}
              >
                <span>{monthlyPresetLabel}</span>
                {activePreset === 'month' && (
                  <Icon name="check" size={18} className="text-primary shrink-0" />
                )}
              </button>

              <button
                type="button"
                data-testid="repeat-option-year"
                onClick={() => handlePickPreset('year')}
                className={cn(
                  'w-full min-h-12 px-4 flex items-center justify-between gap-3 bg-transparent border-0 text-left text-base cursor-pointer hover:bg-muted/50',
                  activePreset === 'year' ? 'font-semibold text-foreground' : 'font-medium text-foreground',
                )}
              >
                <span>
                  {t('recurring.schedule.yearly', {
                    date: formatDayMonth(date),
                  })}
                </span>
                {activePreset === 'year' && (
                  <Icon name="check" size={18} className="text-primary shrink-0" />
                )}
              </button>

              <button
                type="button"
                data-testid="repeat-option-custom"
                onClick={handleOpenCustom}
                className={cn(
                  'w-full min-h-12 px-4 flex items-center justify-between gap-3 bg-transparent border-0 text-left text-base cursor-pointer hover:bg-muted/50',
                  activePreset === 'custom' ? 'font-semibold text-foreground' : 'font-medium text-foreground',
                )}
              >
                <span>{t('recurring.presetCustom')}</span>
                <span className="flex items-center gap-1 shrink-0">
                  {activePreset === 'custom' && (
                    <Icon name="check" size={18} className="text-primary shrink-0" />
                  )}
                  <Icon name="chevronRight" size={18} className="text-muted-foreground shrink-0" />
                </span>
              </button>
            </div>

            <p data-testid="repeat-sheet-hint" className="m-0 px-1 text-xs text-muted-foreground">
              {nextDate
                ? t('recurring.sheetHint', { date: formatDayMonth(nextDate) })
                : t('recurring.sheetHintNoNext')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-2">
            {/* Every N + unit segmented control */}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">
                  {t('recurring.every')}
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={everyText}
                  onChange={(e) => setEveryText(e.target.value)}
                  aria-label={t('recurring.everyInputAria')}
                  data-testid="repeat-every"
                  className="w-20 min-h-11 text-base text-center font-semibold tabular-nums rounded-xl"
                />
              </div>

              <div className="flex bg-muted rounded-full p-1 gap-1">
                {UNITS.map((u) => {
                  const selected = unit === u;
                  return (
                    <button
                      key={u}
                      type="button"
                      aria-pressed={selected}
                      data-testid={`repeat-unit-${u}`}
                      onClick={() => setUnit(u)}
                      className={cn(
                        'flex-1 min-h-11 rounded-full text-sm font-semibold border-0 cursor-pointer transition-colors',
                        selected
                          ? 'bg-card text-foreground shadow-xs'
                          : 'bg-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {unitLabel(u)}
                    </button>
                  );
                })}
              </div>

              {unit === 'week' && (
                <div className="flex items-center gap-1">
                  {WEEKDAYS.map((wd) => {
                    const selected = weekdays.includes(wd);
                    return (
                      <button
                        key={wd}
                        type="button"
                        aria-pressed={selected}
                        data-testid={`repeat-weekday-${wd}`}
                        onClick={() => toggleWeekday(wd)}
                        className={cn(
                          'flex-1 min-h-11 rounded-full text-xs font-semibold border-0 cursor-pointer transition-colors',
                          selected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground hover:bg-accent',
                        )}
                      >
                        {weekdayShortLabel(wd, t)}
                      </button>
                    );
                  })}
                </div>
              )}

              {unit === 'month' && (
                <>
                  <div className="flex bg-muted rounded-full p-1 gap-1">
                    <button
                      type="button"
                      aria-pressed={monthDayMode === 'date'}
                      data-testid="repeat-monthday-date"
                      onClick={() => setMonthDayMode('date')}
                      className={cn(
                        'flex-1 min-h-11 rounded-full text-sm font-semibold border-0 cursor-pointer transition-colors',
                        monthDayMode === 'date'
                          ? 'bg-card text-foreground shadow-xs'
                          : 'bg-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t('recurring.monthDayDate', { day: customMonthDay })}
                    </button>
                    <button
                      type="button"
                      aria-pressed={monthDayMode === 'last'}
                      data-testid="repeat-monthday-last"
                      onClick={() => setMonthDayMode('last')}
                      className={cn(
                        'flex-1 min-h-11 rounded-full text-sm font-semibold border-0 cursor-pointer transition-colors',
                        monthDayMode === 'last'
                          ? 'bg-card text-foreground shadow-xs'
                          : 'bg-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t('recurring.monthDayLast')}
                    </button>
                  </div>
                  {monthDayMode === 'date' && customMonthDay >= 29 && (
                    <p
                      data-testid="repeat-short-month-note"
                      className="m-0 text-xs text-muted-foreground"
                    >
                      {t('recurring.shortMonthNote', { day: customMonthDay })}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Kết thúc */}
            <div className="flex flex-col gap-1.5">
              <span className="px-1 text-sm font-semibold text-muted-foreground">
                {t('recurring.endLabel')}
              </span>
              <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                <button
                  type="button"
                  data-testid="repeat-end-never"
                  onClick={() => setEndKind('never')}
                  className="w-full min-h-11 px-4 py-3 flex items-center justify-between gap-3 bg-transparent border-0 text-left text-sm font-medium text-foreground cursor-pointer hover:bg-muted/50"
                >
                  <span>{t('recurring.endNever')}</span>
                  {endKind === 'never' && (
                    <Icon name="check" size={18} className="text-primary shrink-0" />
                  )}
                </button>

                <div className="flex flex-col">
                  <button
                    type="button"
                    data-testid="repeat-end-on"
                    onClick={() => setEndKind('date')}
                    className="w-full min-h-11 px-4 py-3 flex items-center justify-between gap-3 bg-transparent border-0 text-left text-sm font-medium text-foreground cursor-pointer hover:bg-muted/50"
                  >
                    <span>{t('recurring.endOnDate')}</span>
                    {endKind === 'date' && (
                      <Icon name="check" size={18} className="text-primary shrink-0" />
                    )}
                  </button>
                  {endKind === 'date' && (
                    <div className="px-4 pb-3">
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        aria-label={t('recurring.endDateAria')}
                        data-testid="repeat-end-date"
                        className="min-h-11 text-base rounded-xl"
                      />
                    </div>
                  )}
                </div>

                <div className="px-4 py-2 min-h-11 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    data-testid="repeat-end-after"
                    onClick={() => {
                      setEndKind('count');
                      countInputRef.current?.focus();
                    }}
                    className="min-h-11 flex-1 flex items-center gap-2 bg-transparent border-0 p-0 text-left text-sm font-medium text-foreground cursor-pointer"
                  >
                    <span>{t('recurring.endAfterCount')}</span>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      ref={countInputRef}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={endCountText}
                      onFocus={() => setEndKind('count')}
                      onChange={(e) => {
                        setEndKind('count');
                        setEndCountText(e.target.value);
                      }}
                      aria-label={t('recurring.endAfterCountAria')}
                      data-testid="repeat-end-count"
                      className="w-20 min-h-11 text-base text-center font-semibold tabular-nums rounded-xl"
                    />
                    <span className="text-sm text-muted-foreground">
                      {t('recurring.endCountSuffix')}
                    </span>
                    {endKind === 'count' && (
                      <Icon name="check" size={18} className="text-primary shrink-0" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Ask me switch */}
            <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between gap-3">
              <Label
                htmlFor="repeat-askme-switch"
                className="flex-1 flex flex-col items-start gap-0.5 cursor-pointer"
              >
                <span className="text-sm font-semibold text-foreground">
                  {t('recurring.askMeTitle')}
                </span>
                <span className="text-xs font-normal text-muted-foreground leading-snug">
                  {isBuy ? t('recurring.askMeBuyHint') : t('recurring.askMeHint')}
                </span>
              </Label>
              <Switch
                id="repeat-askme-switch"
                checked={isBuy ? true : draftAskMe}
                disabled={isBuy}
                onCheckedChange={(checked) => {
                  if (!isBuy) setDraftAskMe(checked);
                }}
                aria-label={t('recurring.askMeTitle')}
                data-testid="repeat-askme"
              />
            </div>

            {/* Jade Mist check-in note */}
            <div
              data-testid="repeat-checkin-note"
              className="rounded-xl bg-secondary text-secondary-foreground px-4 py-3 text-xs leading-relaxed"
            >
              {t('recurring.checkInNote')}
            </div>

            <Button
              type="button"
              variant="primary"
              block
              data-testid="repeat-done"
              onClick={handleCustomDone}
            >
              {t('recurring.done')}
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}
