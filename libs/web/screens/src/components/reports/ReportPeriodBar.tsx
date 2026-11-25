import { useState, useEffect, type JSX } from 'react';
import {
  resolveReportPeriod,
  type ReportPeriodMode,
  type ReportPeriodWindow,
  type ReportQuery,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Button } from '@cc/web-ui/components/Button';
import { Icon } from '@cc/web-ui/components/icons';
import { Sheet } from '@cc/web-ui/components/Sheet';
import { Tabs, TabsList, TabsTrigger } from '@cc/web-ui/components/ui/tabs';
import { Input } from '@cc/web-ui/components/ui/input';
import { Label } from '@cc/web-ui/components/ui/label';
import { diffDaysUtc, formatReportPeriodHeading, stepReportPeriod } from './reportUrl';

export interface ReportPeriodBarProps {
  query: ReportQuery;
  period?: ReportPeriodWindow;
  today: string;
  onChange: (next: ReportQuery) => void;
}

export function ReportPeriodBar({
  query,
  period,
  today,
  onChange,
}: ReportPeriodBarProps): JSX.Element {
  const t = useT();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Sync draft states whenever custom sheet opens or query dates change
  useEffect(() => {
    if (isSheetOpen) {
      setDraftFrom(query.from ?? `${today.slice(0, 7)}-01`);
      setDraftTo(query.to ?? today);
      setError(null);
    }
  }, [isSheetOpen, query.from, query.to, today]);

  const activePeriod = period ?? resolveReportPeriod(query, today);
  const heading = formatReportPeriodHeading(activePeriod, t);

  const handleApplyCustom = () => {
    if (!draftFrom || !draftTo) {
      setError(t('error.validation'));
      return;
    }
    if (draftFrom > draftTo) {
      setError(t('transactions.rangeFromAfterTo'));
      return;
    }
    const L = diffDaysUtc(draftFrom, draftTo) + 1;
    if (L > 366) {
      setError(t('transactions.rangeTooLong'));
      return;
    }

    setError(null);
    onChange({
      ...query,
      mode: 'custom',
      from: draftFrom,
      to: draftTo,
    });
    setIsSheetOpen(false);
  };

  const handleModeChange = (val: string) => {
    const nextMode = val as ReportPeriodMode;
    if (nextMode === 'custom') {
      setIsSheetOpen(true);
    } else {
      onChange({
        ...query,
        mode: nextMode,
      });
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* 4-mode tabs */}
      <Tabs value={query.mode} onValueChange={handleModeChange} className="w-full">
        <TabsList className="grid w-full grid-cols-4 group-data-horizontal/tabs:h-auto min-h-11 p-1">
          <TabsTrigger value="week" className="min-h-11 text-xs sm:text-sm">
            {t('reports.modeWeek')}
          </TabsTrigger>
          <TabsTrigger value="month" className="min-h-11 text-xs sm:text-sm">
            {t('reports.modeMonth')}
          </TabsTrigger>
          <TabsTrigger value="year" className="min-h-11 text-xs sm:text-sm">
            {t('reports.modeYear')}
          </TabsTrigger>
          <TabsTrigger
            value="custom"
            className="min-h-11 text-xs sm:text-sm"
            onClick={() => setIsSheetOpen(true)}
          >
            {t('reports.modeCustom')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Stepper and Centered Period Label */}
      <div className="flex items-center justify-between gap-2 w-full px-1">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 min-w-11 size-11 p-0 rounded-full shrink-0"
          onClick={() => onChange(stepReportPeriod(query, -1, today))}
          aria-label={t('reports.prevPeriod')}
          title={t('reports.prevPeriod')}
        >
          <Icon name="chevronLeft" size={20} />
        </Button>

        <div className="flex-1 flex items-center justify-center min-w-0">
          {query.mode === 'custom' ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 px-3 py-1 text-sm font-semibold hover:bg-muted rounded-xl flex items-center justify-center gap-1.5 max-w-full truncate"
              onClick={() => setIsSheetOpen(true)}
              aria-label={heading}
            >
              <span className="truncate">{heading}</span>
              <Icon name="calendar" size={16} className="text-muted-foreground shrink-0" />
            </Button>
          ) : (
            <span className="text-sm font-semibold text-foreground text-center select-none truncate px-2">
              {heading}
            </span>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          className="min-h-11 min-w-11 size-11 p-0 rounded-full shrink-0"
          onClick={() => onChange(stepReportPeriod(query, 1, today))}
          aria-label={t('reports.nextPeriod')}
          title={t('reports.nextPeriod')}
        >
          <Icon name="chevronRight" size={20} />
        </Button>
      </div>

      {/* Custom Date Range Sheet */}
      <Sheet
        open={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        title={t('reports.modeCustom')}
      >
        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="report-custom-from">{t('reports.customFrom')}</Label>
            <Input
              id="report-custom-from"
              type="date"
              className="text-base min-h-11"
              value={draftFrom}
              onChange={(e) => {
                setDraftFrom(e.target.value);
                setError(null);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-custom-to">{t('reports.customTo')}</Label>
            <Input
              id="report-custom-to"
              type="date"
              className="text-base min-h-11"
              value={draftTo}
              onChange={(e) => {
                setDraftTo(e.target.value);
                setError(null);
              }}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button
            type="button"
            variant="primary"
            block
            className="min-h-11"
            onClick={handleApplyCustom}
          >
            {t('reports.applyCustom')}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
