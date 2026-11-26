import { formatMoney, type BudgetProgress, type CurrencyCode } from '@cc/core';
import type { useT } from '@cc/web-i18n';
import type { IconName } from '@cc/web-ui/components/icons';

export type BudgetTranslateFn = ReturnType<typeof useT>;

export interface BudgetStateWordsResult {
  text: string;
  icon: IconName;
  className: string;
}

/**
 * Returns the plain-language status, icon and semantic text class for a budget state.
 * Every state carries words and an icon so status never depends on colour alone.
 */
export function budgetStateWords(
  progress: BudgetProgress,
  t: BudgetTranslateFn,
  currency: CurrencyCode = 'VND',
): BudgetStateWordsResult {
  if (progress.state === 'over') {
    const pct =
      progress.limit > 0
        ? Math.max(1, Math.round(((progress.spent - progress.limit) / progress.limit) * 100))
        : 100;
    return {
      text: t('budgets.overBy', { pct }),
      icon: 'ban',
      className: 'text-danger font-semibold',
    };
  }

  if (progress.state === 'fast') {
    const projectedOver =
      progress.projectedOverPct !== null && progress.limit > 0
        ? Math.max(0, Math.round(progress.projectedOverPct * progress.limit))
        : 0;
    return {
      text: t('budgets.willOverBy', { amount: formatMoney(projectedOver, currency) }),
      icon: 'zap',
      className: 'text-warning font-semibold',
    };
  }

  if (progress.state === 'near') {
    return {
      text: t('budgets.near'),
      icon: 'clock',
      className: 'text-warning font-semibold',
    };
  }

  const leftRatio = progress.limit > 0 ? progress.left / progress.limit : 1;
  let fineText: string;
  if (leftRatio >= 0.75) {
    fineText = t('budgets.fineMostLeft');
  } else if (leftRatio > 0.55) {
    fineText = t('budgets.fineOverHalf');
  } else if (leftRatio >= 0.42) {
    fineText = t('budgets.fineAboutHalf');
  } else if (leftRatio >= 0.25) {
    fineText = t('budgets.fineThird');
  } else {
    fineText = t('budgets.fineLittle');
  }

  return {
    text: fineText,
    icon: 'check',
    className: 'text-muted-foreground',
  };
}

/** Formats remaining period time for a budget row's pace line. */
export function budgetTimeLeft(daysLeft: number, t: BudgetTranslateFn): string {
  if (daysLeft <= 0) return '';
  if (daysLeft >= 365) {
    const totalMonths = Math.floor(daysLeft / 30);
    const y = Math.floor(totalMonths / 12);
    const m = totalMonths % 12;
    return t('budgets.timeLeftMonths', { y, m });
  }
  return t('budgets.timeLeftDays', { n: daysLeft });
}
