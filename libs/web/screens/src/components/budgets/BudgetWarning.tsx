import type { JSX } from 'react';
import {
  formatMoney,
  type BudgetImpact,
  type BudgetState,
  type CurrencyCode,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Icon, type IconName } from '@cc/web-ui/components/icons';
import { cn } from '@cc/web-ui/lib/utils';
import { BudgetBar } from './BudgetBar';

type TranslateFn = ReturnType<typeof useT>;

export interface BudgetWarningProps {
  impacts: BudgetImpact[];
  currency?: CurrencyCode;
  className?: string;
}

function statePhrase(state: BudgetState, t: TranslateFn): string {
  if (state === 'over') return t('budgets.overLabel');
  if (state === 'fast') return t('budgets.stateFast').toLowerCase();
  if (state === 'near') return t('budgets.near').toLowerCase();
  return '';
}

function formatPaceUnit(
  pace: { unit: 'day' | 'month'; amount: number },
  currency: CurrencyCode,
  t: TranslateFn,
): string {
  return t(pace.unit === 'month' ? 'budgets.paceUnitMonth' : 'budgets.paceUnitDay', {
    amount: formatMoney(pace.amount, currency),
  });
}

function leadHeadline(
  impact: BudgetImpact,
  currency: CurrencyCode,
  t: TranslateFn,
): string {
  const { name, before, after } = impact;
  if (after.state === 'over') {
    const overAmt = formatMoney(Math.abs(after.left), currency);
    if (before.state === 'over') {
      return t('budgets.warnAlreadyOver', { name, amount: overAmt });
    }
    return t('budgets.warnOver', { name, amount: overAmt });
  }
  if (after.state === 'fast') {
    return t('budgets.warnFast', { name });
  }
  return t('budgets.warnNear', { name });
}

function leadDetail(
  impact: BudgetImpact,
  currency: CurrencyCode,
  t: TranslateFn,
): string {
  const { after } = impact;
  if (after.state === 'over') {
    if (after.daysLeft <= 0) {
      return t('budgets.notePastOver', {
        amount: formatMoney(Math.abs(after.left), currency),
        limit: formatMoney(after.limit, currency),
      });
    }
    return t('budgets.stopUntilEnd');
  }
  if (after.pace) {
    return t('budgets.warnAfter', {
      left: formatMoney(Math.max(0, after.left), currency),
      pace: formatPaceUnit(after.pace, currency, t),
    });
  }
  return t('budgets.notePastNear', {
    limit: formatMoney(after.limit, currency),
    spent: formatMoney(after.spent, currency),
  });
}

/** Formats the post-save snackbar message for an expense that hits a non-fine budget (B14 / B21). */
export function formatBudgetSavedMessage(
  impact: BudgetImpact,
  currency: CurrencyCode,
  t: TranslateFn,
): string {
  const { name, after } = impact;
  if (after.state === 'over') {
    const overAmt = formatMoney(Math.abs(after.left), currency);
    return t('budgets.savedWithBudget', {
      name,
      state: t('budgets.stateOver').toLowerCase(),
      detail: t('budgets.pastOver', { amount: overAmt }).toLowerCase(),
    });
  }
  const state =
    after.state === 'fast'
      ? t('budgets.stateFast').toLowerCase()
      : t('budgets.near').toLowerCase();
  const detail = after.pace
    ? t(after.pace.unit === 'month' ? 'budgets.pacePerMonth' : 'budgets.pacePerDay', {
        amount: formatMoney(after.pace.amount, currency),
      })
    : formatMoney(Math.max(0, after.left), currency);
  return t('budgets.savedWithBudget', { name, state, detail });
}

/**
 * Live budget impact warning rendered inside the expense entry form (B13 / B21).
 * Never blocks saving and renders nothing when no budget is affected.
 */
export function BudgetWarning({
  impacts,
  currency = 'VND',
  className,
}: BudgetWarningProps): JSX.Element | null {
  const t = useT();
  const lead = impacts[0];
  if (!lead) return null;

  const isOver = lead.after.state === 'over';
  const iconName: IconName =
    lead.after.state === 'over' ? 'ban' : lead.after.state === 'fast' ? 'zap' : 'clock';

  const limit = lead.after.limit;
  const usedPct =
    limit > 0 ? (lead.before.spent / limit) * 100 : lead.before.spent > 0 ? 100 : 0;
  const addingAmount = Math.max(0, lead.after.spent - lead.before.spent);
  const addingPct =
    limit > 0 ? (addingAmount / limit) * 100 : addingAmount > 0 ? 100 : 0;
  const todayPct = lead.after.daysLeft > 0 ? lead.after.elapsed * 100 : undefined;

  const others = impacts.slice(1);

  return (
    <div
      role="status"
      data-testid="entry-budget-warning"
      className={cn(
        'fsl-budget-warning rounded-xl px-4 py-3 flex flex-col gap-2.5',
        isOver ? 'bg-danger-soft text-foreground' : 'bg-warning-soft text-warning-foreground',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          name={iconName}
          size={18}
          className={cn('shrink-0 mt-0.5', isOver ? 'text-danger' : 'text-warning')}
        />
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <p
            className={cn(
              'm-0 text-sm font-semibold tabular-nums',
              isOver ? 'text-danger' : 'text-warning-foreground',
            )}
          >
            {leadHeadline(lead, currency, t)}
          </p>
          <p className="m-0 text-sm tabular-nums">
            {leadDetail(lead, currency, t)}
          </p>
          {others.map((other) => (
            <p key={other.budgetId} className="m-0 text-sm">
              {t('budgets.warnAlso', {
                name: other.name,
                state: statePhrase(other.after.state, t),
              })}
            </p>
          ))}
        </div>
      </div>

      <BudgetBar
        state={lead.after.state}
        used={usedPct}
        adding={addingPct}
        today={todayPct}
        className="bg-card/70"
      />
    </div>
  );
}
