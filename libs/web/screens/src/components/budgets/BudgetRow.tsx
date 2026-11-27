import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router';
import { formatMoney, type BudgetDef, type BudgetProgress } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Icon, type IconName } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import { BudgetBar } from './BudgetBar';
import { formatDayMonth, parseYmd } from './budgetLabels';
import { budgetStateWords, budgetTimeLeft } from './budgetWords';

function nextDayYmd(ymd: string): string {
  const [y, m, d] = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const ry = String(dt.getUTCFullYear()).padStart(4, '0');
  const rm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

export interface BudgetRowProps {
  progress: BudgetProgress;
  def: BudgetDef;
  /** Icon name for the category or tag tile; defaults to 'tag' for tags or 'receipt' otherwise. */
  icon?: IconName;
  /** Shows the B12 suggestion mark when a 6-period limit change is suggested. */
  hasSuggestion?: boolean;
  /** Parent budget name when this budget sits inside an ancestor category budget. */
  withinName?: string;
  /** Set when an ancestor category budget is currently over its limit. */
  parentOver?: { name: string };
}

/** True when the row leads with the per-day (or per-month) amount instead of the amount left. */
function leadsWithPace(progress: BudgetProgress): boolean {
  return (
    progress.state !== 'over' &&
    !progress.ended &&
    progress.pace !== null &&
    progress.daysLeft > 1
  );
}

function formatMetaLine(
  progress: BudgetProgress,
  def: BudgetDef,
  t: ReturnType<typeof useT>,
  isParentOver: boolean,
): ReactNode {
  if (progress.ended) return null;

  if (progress.state === 'over' || isParentOver) {
    const forward =
      def.periodKind === 'once'
        ? t('budgets.rowEndsOn', { date: formatDayMonth(progress.period.to) })
        : t('budgets.rowNextPeriod', {
            date: formatDayMonth(nextDayYmd(progress.period.to)),
          });
    return `${t('budgets.stopUntilEnd')} · ${forward}`;
  }

  const timeLeft = budgetTimeLeft(progress.daysLeft, t);

  if (!leadsWithPace(progress)) {
    return timeLeft || null;
  }

  const left = `${formatMoney(Math.max(0, progress.left), def.currency)} ${t('budgets.left')}`;
  return (
    <>
      <span className="tabular-nums">{left}</span>
      {timeLeft ? ` · ${timeLeft}` : ''}
    </>
  );
}

export function BudgetRow({
  progress,
  def,
  icon,
  hasSuggestion = false,
  withinName,
  parentOver,
}: BudgetRowProps): JSX.Element {
  const t = useT();
  const resolvedIcon: IconName = icon ?? (def.target.kind === 'tag' ? 'tag' : 'receipt');

  const isOver = progress.state === 'over';
  const isParentOver = Boolean(parentOver) && !isOver && !progress.ended;
  const words = isParentOver
    ? {
        text: t('budgets.parentOver', { name: parentOver!.name }),
        icon: 'ban' as IconName,
        className: 'text-danger font-semibold',
      }
    : budgetStateWords(progress, t, def.currency);

  const showPace = leadsWithPace(progress);
  const absOverAmount = formatMoney(Math.abs(progress.left), def.currency);
  const amountText = isOver
    ? `\u2212${absOverAmount}`
    : showPace && progress.pace
      ? formatMoney(progress.pace.amount, def.currency)
      : formatMoney(Math.max(0, progress.left), def.currency);
  const amountLabel = isOver
    ? t('budgets.overLabel')
    : showPace && progress.pace
      ? t(progress.pace.unit === 'month' ? 'budgets.perMonthShort' : 'budgets.perDayShort')
      : t('budgets.left');

  const ariaLabel = isParentOver
    ? `${def.name}, ${words.text}`
    : isOver
      ? `${def.name}, ${words.text}, ${t('budgets.overAmountAria', { amount: absOverAmount })}`
      : `${def.name}, ${words.text}, ${amountText} ${amountLabel}`;

  const usedPct =
    progress.limit > 0
      ? Math.min(100, Math.round((progress.spent / progress.limit) * 100))
      : progress.spent > 0
        ? 100
        : 0;
  const todayPct = Math.round(progress.elapsed * 100);
  const paceNode = formatMetaLine(progress, def, t, isParentOver);

  return (
    <Link
      to={`/budgets/${encodeURIComponent(def.id)}`}
      data-testid={`budget-row-${def.id}`}
      aria-label={ariaLabel}
      className="fsl-budget-row w-full min-h-11 px-4 py-3 flex flex-col gap-2.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none no-underline text-foreground"
    >
      <div className="flex items-center gap-3">
        <span className="size-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
          <Icon name={resolvedIcon} size={20} />
        </span>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">{def.name}</span>
            {hasSuggestion && (
              <>
                <span
                  data-testid="budget-suggest-mark"
                  aria-hidden="true"
                  className="size-2 rounded-full bg-primary shrink-0"
                />
                <span className="sr-only">{t('budgets.suggestMark')}</span>
              </>
            )}
          </div>
          <span
            data-testid="budget-state-words"
            className={cn('inline-flex items-center gap-1 text-sm', words.className)}
          >
            <Icon name={words.icon} size={14} className="shrink-0" />
            <span>{words.text}</span>
          </span>
          {withinName && !isParentOver && (
            <span
              className="text-xs text-muted-foreground truncate"
              data-testid="budget-row-within"
            >
              {t('budgets.withinParent', { name: withinName })}
            </span>
          )}
        </div>

        {!isParentOver && (
          <div className="flex flex-col items-end shrink-0">
            <span
              data-testid="budget-row-amount"
              className={cn(
                'text-sm font-semibold tabular-nums',
                isOver ? 'text-danger' : 'text-foreground',
              )}
            >
              {amountText}
            </span>
            {!isOver && (
              <span className="text-xs text-muted-foreground">{amountLabel}</span>
            )}
          </div>
        )}
      </div>

      <BudgetBar
        state={progress.state}
        used={usedPct}
        today={progress.ended || isOver || isParentOver ? undefined : todayPct}
      />

      {paceNode !== null && (
        <span className="text-sm text-muted-foreground">{paceNode}</span>
      )}
    </Link>
  );
}
