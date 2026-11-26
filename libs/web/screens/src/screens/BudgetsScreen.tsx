import { useMemo, useState, type JSX, type MouseEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { BudgetDef, BudgetProgress } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useBudgets, useBudgetsProgress } from '@cc/web-data-access/budgets';
import { useCategories } from '@cc/web-data-access/personalMoney';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { Icon, type IconName } from '@cc/web-ui/components/icons';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Screen } from '../components/Screen';
import { categoryIconName } from '../components/categoryIcon';
import { BudgetForm } from '../components/budgets/BudgetForm';
import { BudgetRow } from '../components/budgets/BudgetRow';

interface BudgetGroupSectionProps {
  testId: string;
  heading: string;
  items: BudgetProgress[];
  defById: Map<string, BudgetDef>;
  iconFor: (def: BudgetDef) => IconName;
  hasSuggestion: (id: string) => boolean;
}

function BudgetGroupSection({
  testId,
  heading,
  items,
  defById,
  iconFor,
  hasSuggestion,
}: BudgetGroupSectionProps): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <section data-testid={testId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="m-0 text-sm font-semibold text-muted-foreground">{heading}</h2>
      </div>
      <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
        {items.map((progress) => {
          const def = defById.get(progress.budgetId);
          if (!def) return null;
          return (
            <BudgetRow
              key={def.id}
              progress={progress}
              def={def}
              icon={iconFor(def)}
              hasSuggestion={hasSuggestion(def.id)}
            />
          );
        })}
      </div>
    </section>
  );
}

export function BudgetsScreen(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const budgetsQuery = useBudgets();
  const { groups, defs, suggestion, isPending, error } = useBudgetsProgress();
  const categoriesQuery = useCategories();
  const [endedOpen, setEndedOpen] = useState(false);

  const formOpen = searchParams.get('new') === '1';
  const prefillCategoryId = searchParams.get('categoryId');
  const prefillAmount = searchParams.get('amount');
  const handleOpenForm = (e: MouseEvent<HTMLElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate('/budgets?new=1', { replace: true });
  };
  const handleCloseForm = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    next.delete('categoryId');
    next.delete('amount');
    setSearchParams(next, { replace: true });
  };

  const defById = useMemo(() => {
    const map = new Map<string, BudgetDef>();
    for (const def of defs) {
      map.set(def.id, def);
    }
    return map;
  }, [defs]);

  const categoryIconById = useMemo(() => {
    const map = new Map<string, IconName>();
    for (const cat of categoriesQuery.data?.categories ?? []) {
      map.set(cat.id, categoryIconName(cat.icon, cat.type));
    }
    return map;
  }, [categoriesQuery.data?.categories]);

  const iconFor = (def: BudgetDef): IconName => {
    if (def.target.kind === 'tag') return 'tag';
    return categoryIconById.get(def.target.categoryId) ?? 'receipt';
  };

  const hasSuggestion = (id: string): boolean => suggestion(id) !== null;

  return (
    <Screen
      title={t('budgets.title')}
      back="/trips"
      right={
        <Button
          variant="ghost"
          href="/budgets?new=1"
          onClick={handleOpenForm}
          data-testid="budgets-add-button"
          aria-label={t('budgets.add')}
          title={t('budgets.add')}
          className="size-11 p-0"
        >
          <Icon name="plus" size={22} />
        </Button>
      }
    >
      <div className="fsl-budgets flex flex-col gap-4">
        {isPending && defs.length === 0 ? (
          <SkeletonList rows={3} />
        ) : error && defs.length === 0 ? (
          <InlineError error={error} onRetry={() => budgetsQuery.refetch()} />
        ) : defs.length === 0 ? (
          <EmptyState
            icon="pie-chart"
            title={t('budgets.emptyTitle')}
            body={t('budgets.emptyBody')}
            action={
              <Button
                variant="primary"
                block
                href="/budgets?new=1"
                onClick={handleOpenForm}
                data-testid="budgets-empty-add"
              >
                {t('budgets.add')}
              </Button>
            }
          />
        ) : (
          <>
            <BudgetGroupSection
              testId="budgets-group-over"
              heading={t('budgets.groupOver', { count: groups.over.length })}
              items={groups.over}
              defById={defById}
              iconFor={iconFor}
              hasSuggestion={hasSuggestion}
            />
            <BudgetGroupSection
              testId="budgets-group-fast"
              heading={t('budgets.groupFast', { count: groups.fast.length })}
              items={groups.fast}
              defById={defById}
              iconFor={iconFor}
              hasSuggestion={hasSuggestion}
            />
            <BudgetGroupSection
              testId="budgets-group-on-pace"
              heading={t('budgets.groupOnPace', { count: groups.onPace.length })}
              items={groups.onPace}
              defById={defById}
              iconFor={iconFor}
              hasSuggestion={hasSuggestion}
            />

            {groups.ended.length > 0 && (
              <section data-testid="budgets-group-ended" className="flex flex-col gap-2">
                <button
                  type="button"
                  data-testid="budgets-ended-toggle"
                  aria-expanded={endedOpen}
                  onClick={() => setEndedOpen((v) => !v)}
                  className="flex items-center justify-between min-h-11 px-1 text-sm font-semibold text-muted-foreground cursor-pointer bg-transparent border-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>{`${t('budgets.groupEnded')} · ${groups.ended.length}`}</span>
                  <Icon name={endedOpen ? 'chevronUp' : 'chevronDown'} size={18} />
                </button>
                {endedOpen && (
                  <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
                    {groups.ended.map((progress) => {
                      const def = defById.get(progress.budgetId);
                      if (!def) return null;
                      return (
                        <BudgetRow
                          key={def.id}
                          progress={progress}
                          def={def}
                          icon={iconFor(def)}
                          hasSuggestion={false}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
      <BudgetForm
        open={formOpen}
        onClose={handleCloseForm}
        initialCategoryId={prefillCategoryId}
        initialAmount={prefillAmount}
      />
    </Screen>
  );
}
