import { useMemo, type JSX } from 'react';
import { Link } from 'react-router';
import type { BudgetProgress, CurrencyCode } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useBudgetsProgress } from '@cc/web-data-access/budgets';
import { Icon } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import { BudgetBar } from './BudgetBar';
import { budgetStateWords, type BudgetStateWordsResult } from './budgetWords';

function cardStateWords(
  progress: BudgetProgress,
  t: ReturnType<typeof useT>,
  currency: CurrencyCode,
): BudgetStateWordsResult {
  if (progress.state === 'over') {
    return {
      text: t('budgets.stateOver'),
      icon: 'ban',
      className: 'text-danger font-semibold',
    };
  }
  if (progress.state === 'fast') {
    return {
      text: t('budgets.stateFast'),
      icon: 'zap',
      className: 'text-warning font-semibold',
    };
  }
  return budgetStateWords(progress, t, currency);
}

/**
 * Quiet overview budgets card on Sổ chi tiêu: shows up to two most urgent
 * active budgets with name, plain-language state, and progress bar (no amounts).
 */
export function BookBudgets({ show = true }: { show?: boolean }): JSX.Element | null {
  const t = useT();
  const { groups, defs, isPending, error } = useBudgetsProgress();

  const defById = useMemo(() => new Map(defs.map((d) => [d.id, d])), [defs]);

  if (!show || isPending || error) {
    return null;
  }

  const top = [...groups.over, ...groups.fast, ...groups.onPace].slice(0, 2);
  if (top.length === 0) {
    return null;
  }

  return (
    <section
      data-testid="book-budgets"
      className="fsl-book__budgets flex flex-col gap-2 w-full"
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="m-0 text-sm font-semibold text-muted-foreground">
          {t('budgets.title')}
        </h2>
        <Link
          to="/budgets"
          data-testid="book-budgets-all"
          className="inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-2 -my-2 -mr-2"
        >
          <span>{t('transactions.allLink')}</span>
          <Icon name="chevronRight" size={16} />
        </Link>
      </div>
      <div className="bg-card rounded-xl overflow-hidden divide-y divide-border">
        {top.map((progress) => {
          const def = defById.get(progress.budgetId);
          if (!def) return null;
          const words = cardStateWords(progress, t, def.currency);
          const usedPct =
            progress.limit > 0
              ? Math.min(100, Math.round((progress.spent / progress.limit) * 100))
              : progress.spent > 0
                ? 100
                : 0;
          const todayPct = Math.round(progress.elapsed * 100);

          return (
            <Link
              key={def.id}
              to={`/budgets/${encodeURIComponent(def.id)}`}
              data-testid={`book-budget-row-${def.id}`}
              className="fsl-book__budget-row flex flex-col gap-2 min-h-11 px-4 py-3 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none no-underline"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground truncate">
                  {def.name}
                </span>
                <span
                  data-testid="book-budget-state"
                  className={cn(
                    'inline-flex items-center gap-1 text-sm shrink-0',
                    words.className,
                  )}
                >
                  <Icon name={words.icon} size={14} className="shrink-0" />
                  <span>{words.text}</span>
                </span>
              </div>
              <BudgetBar state={progress.state} used={usedPct} today={todayPct} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
