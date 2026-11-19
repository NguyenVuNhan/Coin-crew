import { useEffect, useState, type JSX } from 'react';
import { getLang, useT } from '@cc/web-i18n';
import {
  matchQuickRange,
  quickRangeDates,
  validateRange,
  type QuickRange,
} from '@cc/web-util/dateRanges';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { cn } from '@cc/web-ui/lib/utils';

export interface WhenSheetProps {
  open: boolean;
  onClose(): void;
  month: string;
  from?: string;
  to?: string;
  today: string;
  rangeLimitDays?: number;
  onPickMonth(month: string): void;
  onPickRange(r: { from?: string; to?: string }): void;
}

const MIN_YEAR = 2000;
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] as const;

const QUICK_RANGES = [
  { key: 'thisWeek', labelKey: 'transactions.quickThisWeek' },
  { key: 'lastWeek', labelKey: 'transactions.quickLastWeek' },
  { key: 'thisMonth', labelKey: 'transactions.quickThisMonth' },
  { key: 'lastMonth', labelKey: 'transactions.quickLastMonth' },
  { key: 'last30', labelKey: 'transactions.quickLast30' },
] as const satisfies readonly { key: QuickRange; labelKey: string }[];

function formatShortMonth(year: number, monthNum: number, lang: 'vi' | 'en'): string {
  if (lang === 'vi') {
    return `T${monthNum}`;
  }
  return new Date(year, monthNum - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

export function WhenSheet({
  open,
  onClose,
  month,
  from,
  to,
  today,
  rangeLimitDays,
  onPickMonth,
  onPickRange,
}: WhenSheetProps): JSX.Element {
  const t = useT();
  const lang = getLang();

  const currentYear = Number(today.slice(0, 4));
  const currentMonthStr = today.slice(0, 7);
  const hasRange = Boolean(from || to);

  const [year, setYear] = useState<number>(() => Number(month.slice(0, 4)) || currentYear);
  const [customFrom, setCustomFrom] = useState<string>(from ?? '');
  const [customTo, setCustomTo] = useState<string>(to ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setYear(Number(month.slice(0, 4)) || currentYear);
      setCustomFrom(from ?? '');
      setCustomTo(to ?? '');
      setError(null);
    }
  }, [open, month, from, to, currentYear]);

  const matchedRange = hasRange ? matchQuickRange(from, to, today) : null;
  const thisMonthStr = currentMonthStr;
  const lastMonthStr = quickRangeDates('lastMonth', today).from.slice(0, 7);

  const isQuickSelected = (key: QuickRange): boolean => {
    if (hasRange) {
      return matchedRange === key;
    }
    if (key === 'thisMonth') return month === thisMonthStr;
    if (key === 'lastMonth') return month === lastMonthStr;
    return false;
  };

  const handleQuickPick = (key: QuickRange) => {
    if (key === 'thisMonth' || key === 'lastMonth') {
      const targetMonth = quickRangeDates(key, today).from.slice(0, 7);
      onPickMonth(targetMonth);
      onClose();
      return;
    }
    onPickRange(quickRangeDates(key, today));
    onClose();
  };

  const handleMonthPick = (ym: string) => {
    onPickMonth(ym);
    onClose();
  };

  const handleApplyCustom = () => {
    setError(null);
    const nextFrom = customFrom || undefined;
    const nextTo = customTo || undefined;
    const status = validateRange(nextFrom, nextTo, { maxDays: rangeLimitDays, today });
    if (status === 'fromAfterTo') {
      setError(t('transactions.rangeFromAfterTo'));
      return;
    }
    if (status === 'tooLong') {
      setError(t('transactions.rangeTooLong'));
      return;
    }
    onPickRange({ from: nextFrom, to: nextTo });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('transactions.whenTitle')}>
      <div className="fsl-tx-when flex flex-col gap-5 pb-4">
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          {QUICK_RANGES.map(({ key, labelKey }) => {
            const selected = isQuickSelected(key);
            return (
              <button
                key={key}
                type="button"
                data-testid={`tx-when-quick-${key}`}
                onClick={() => handleQuickPick(key)}
                className="w-full min-h-11 flex items-center justify-between px-4 py-2.5 text-sm font-medium text-foreground bg-transparent border-0 cursor-pointer hover:bg-muted transition-colors motion-reduce:transition-none text-left"
              >
                <span>{t(labelKey)}</span>
                {selected && <Icon name="check" size={18} className="text-primary shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              data-testid="tx-when-year-prev"
              aria-label={String(year - 1)}
              disabled={year <= MIN_YEAR}
              onClick={() => setYear((y) => Math.max(MIN_YEAR, y - 1))}
              className="size-11 grid place-items-center rounded-full text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors motion-reduce:transition-none cursor-pointer bg-transparent border-0"
            >
              <Icon name="chevronLeft" size={20} />
            </button>
            <span className="text-sm font-semibold text-foreground tabular-nums">{year}</span>
            <button
              type="button"
              data-testid="tx-when-year-next"
              aria-label={String(year + 1)}
              disabled={year >= currentYear}
              onClick={() => setYear((y) => Math.min(currentYear, y + 1))}
              className="size-11 grid place-items-center rounded-full text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors motion-reduce:transition-none cursor-pointer bg-transparent border-0"
            >
              <Icon name="chevronRight" size={20} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {MONTHS.map((mm) => {
              const ym = `${year}-${mm}`;
              const mNum = Number(mm);
              const isFuture = ym > currentMonthStr;
              const isActive = !hasRange && ym === month;
              return (
                <button
                  key={mm}
                  type="button"
                  data-testid={`tx-when-month-${mm}`}
                  disabled={isFuture}
                  onClick={() => handleMonthPick(ym)}
                  className={cn(
                    'min-h-11 rounded-full text-sm font-medium border transition-colors motion-reduce:transition-none cursor-pointer disabled:opacity-40 disabled:pointer-events-none',
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-foreground border-border hover:bg-muted',
                  )}
                >
                  {formatShortMonth(year, mNum, lang)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-foreground">
            {t('transactions.customRange')}
          </span>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-when-from">{t('transactions.fromDate')}</Label>
              <Input
                id="tx-when-from"
                data-testid="tx-when-from"
                type="date"
                value={customFrom}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  if (error) setError(null);
                }}
                className="text-base min-h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-when-to">{t('transactions.toDate')}</Label>
              <Input
                id="tx-when-to"
                data-testid="tx-when-to"
                type="date"
                value={customTo}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  if (error) setError(null);
                }}
                className="text-base min-h-11"
              />
            </div>
          </div>

          {error && (
            <p data-testid="tx-when-error" role="alert" className="m-0 text-sm text-danger">
              {error}
            </p>
          )}

          <Button
            variant="primary"
            block
            data-testid="tx-when-apply"
            onClick={handleApplyCustom}
          >
            {t('transactions.applyFilters')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
