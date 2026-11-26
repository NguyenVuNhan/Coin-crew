import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router';
import { formatMoney, type BudgetDef, type BudgetProgress } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Icon, type IconName } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import { BudgetBar } from './BudgetBar';
import { budgetStateWords, budgetTimeLeft } from './budgetWords';

export interface BudgetRowProps {
  progress: BudgetProgress;
  def: BudgetDef;
  /** Icon name for the category or tag tile; defaults to 'tag' for tags or 'receipt' otherwise. */
  icon?: IconName;
  /** Shows the B12 suggestion mark when a 6-period limit change is suggested. */
  hasSuggestion?: boolean;
}

const AMOUNT_TOKEN = '__BUDGET_AMT__';

function formatPaceNode(
  progress: BudgetProgress,
  def: BudgetDef,
  t: ReturnType<typeof useT>,
): ReactNode {
  if (progress.ended) return null;

  const timeLeft = budgetTimeLeft(progress.daysLeft, t);

  if (progress.state === 'over') {
    const stop = t('budgets.stopUntilEnd');
    return timeLeft ? `${stop} · ${timeLeft}` : stop;
  }

  if (!progress.pace) {
    return timeLeft || null;
  }

  const paceAmount = formatMoney(progress.pace.amount, def.currency);
  const key = progress.pace.unit === 'month' ? 'budgets.pacePerMonth' : 'budgets.pacePerDay';
  const template = t(key, { amount: AMOUNT_TOKEN });
  const [before, after = ''] = template.split(AMOUNT_TOKEN);

  return (
    <>
      {before}
      <b className="font-semibold text-foreground tabular-nums">{paceAmount}</b>
      {after}
      {timeLeft ? ` · ${timeLeft}` : ''}
    </>
  );
}

export function BudgetRow({
  progress,
  def,
  icon,
  hasSuggestion = false,
}: BudgetRowProps): JSX.Element {
  const t = useT();
  const words = budgetStateWords(progress, t, def.currency);
  const resolvedIcon: IconName = icon ?? (def.target.kind === 'tag' ? 'tag' : 'receipt');

  const isOver = progress.state === 'over';
  const amountText = isOver
    ? `\u2212${formatMoney(Math.abs(progress.left), def.currency)}`
    : formatMoney(Math.max(0, progress.left), def.currency);

  const usedPct =
    progress.limit > 0
      ? Math.min(100, Math.round((progress.spent / progress.limit) * 100))
      : progress.spent > 0
        ? 100
        : 0;
  const todayPct = Math.round(progress.elapsed * 100);
  const paceNode = formatPaceNode(progress, def, t);

  return (
    <Link
      to={`/budgets/${encodeURIComponent(def.id)}`}
      data-testid={`budget-row-${def.id}`}
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
              <span
                data-testid="budget-suggest-mark"
                className="size-2 rounded-full bg-primary shrink-0"
                title={t('budgets.suggestMark')}
                aria-label={t('budgets.suggestMark')}
              />
            )}
          </div>
          <span
            data-testid="budget-state-words"
            className={cn('inline-flex items-center gap-1 text-sm', words.className)}
          >
            <Icon name={words.icon} size={14} className="shrink-0" />
            <span>{words.text}</span>
          </span>
        </div>

        <div className="flex flex-col items-end shrink-0">
          <span
            className={cn(
              'text-sm font-semibold tabular-nums',
              isOver ? 'text-danger' : 'text-foreground',
            )}
          >
            {amountText}
          </span>
          <span className="text-xs text-muted-foreground">
            {isOver ? t('budgets.overLabel') : t('budgets.left')}
          </span>
        </div>
      </div>

      <BudgetBar
        state={progress.state}
        used={usedPct}
        today={progress.ended ? undefined : todayPct}
      />

      {paceNode !== null && (
        <span className="text-sm text-muted-foreground">{paceNode}</span>
      )}
    </Link>
  );
}
