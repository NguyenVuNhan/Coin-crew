import { useState, type JSX } from 'react';
import type { CurrencyCode } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Amount } from '@cc/web-ui/components/Amount';
import { Icon } from '@cc/web-ui/components/icons';
import { Pill } from '@cc/web-ui/components/Pill';
import { resolveCategoryIcon } from '../TransactionRow';

export interface EventCategoryRow {
  categoryId: string;
  name: string;
  icon: string | null | undefined;
  amount: number;
  percent: number;
}

export interface EventCategoryBreakdownProps {
  spending: EventCategoryRow[];
  income: EventCategoryRow[];
  hasIncome: boolean;
  spendingCurrency: CurrencyCode;
  incomeCurrency: CurrencyCode;
  spendingApproximate?: boolean;
  incomeApproximate?: boolean;
  currencySymbolSuffix?: string;
}

/** Category breakdown list for EventDetailScreen with an optional Chi / Thu pill switch when the event has income. */
export function EventCategoryBreakdown({
  spending,
  income,
  hasIncome,
  spendingCurrency,
  incomeCurrency,
  spendingApproximate = false,
  incomeApproximate = false,
  currencySymbolSuffix,
}: EventCategoryBreakdownProps): JSX.Element | null {
  const t = useT();
  const [selectedTab, setSelectedTab] = useState<'expense' | 'income' | null>(null);

  if (!hasIncome && spending.length === 0) {
    return null;
  }

  const effectiveTab: 'expense' | 'income' = !hasIncome
    ? 'expense'
    : selectedTab ?? (spending.length === 0 && income.length > 0 ? 'income' : 'expense');

  const items = effectiveTab === 'income' ? income : spending;
  const currency = effectiveTab === 'income' ? incomeCurrency : spendingCurrency;
  const approximate = effectiveTab === 'income' ? incomeApproximate : spendingApproximate;

  const heading =
    effectiveTab === 'expense' && currencySymbolSuffix
      ? `${t('events.byCategory')} · ${currencySymbolSuffix}`
      : t('events.byCategory');

  return (
    <section data-testid="event-by-category" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="m-0 text-sm font-semibold text-muted-foreground">{heading}</h2>
        {hasIncome && (
          <div
            data-testid="event-category-switch"
            role="group"
            aria-label={t('events.byCategory')}
            className="flex items-center gap-1.5"
          >
            <button
              type="button"
              data-testid="event-category-tab-expense"
              aria-pressed={effectiveTab === 'expense'}
              onClick={() => setSelectedTab('expense')}
              className="min-h-11 inline-flex items-center bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
            >
              <Pill
                tone={effectiveTab === 'expense' ? 'accent' : 'neutral'}
                className="px-3 py-1 text-xs"
              >
                {t('reports.legendExpense')}
              </Pill>
            </button>
            <button
              type="button"
              data-testid="event-category-tab-income"
              aria-pressed={effectiveTab === 'income'}
              onClick={() => setSelectedTab('income')}
              className="min-h-11 inline-flex items-center bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
            >
              <Pill
                tone={effectiveTab === 'income' ? 'accent' : 'neutral'}
                className="px-3 py-1 text-xs"
              >
                {t('reports.legendIncome')}
              </Pill>
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-card border border-border divide-y divide-border overflow-hidden">
        {items.length === 0 ? (
          <div className="px-4 py-4 text-sm text-muted-foreground">
            {effectiveTab === 'income'
              ? t('reports.noIncomeCategory')
              : t('reports.noExpenseCategory')}
          </div>
        ) : (
          items.map((item) => {
            const pct = Math.min(100, Math.max(0, Math.round(item.percent)));
            const showBar = !(items.length === 1 && pct === 100);
            return (
              <div
                key={item.categoryId}
                data-testid={`event-cat-row-${item.categoryId}`}
                className="px-4 py-3 flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground min-w-0 truncate">
                    <Icon
                      name={resolveCategoryIcon(item.icon ?? undefined)}
                      size={16}
                      className="text-muted-foreground shrink-0"
                    />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <Amount
                    value={item.amount}
                    currency={currency}
                    approximate={approximate}
                    size="sm"
                  />
                </div>
                {showBar && (
                  <div
                    data-testid={`event-cat-bar-${item.categoryId}`}
                    className="relative h-2 rounded-full bg-muted overflow-hidden"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
