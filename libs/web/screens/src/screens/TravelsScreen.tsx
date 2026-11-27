import { useMemo, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  daysUntil,
  formatMoney,
  summarizeTravel,
  travelState,
  type BudgetDef,
  type BudgetProgress,
  type TravelExisting,
  type TravelSavedResponse,
  type TravelState,
  type TravelSummary,
  type TravelView,
} from '@cc/core';
import { useT } from '@cc/web-i18n';
import { todayLocal } from '@cc/web-util/localDate';
import { useBudgetsProgress, useBudgetsSource } from '@cc/web-data-access/budgets';
import { useWalletDetails } from '@cc/web-data-access/personalMoney';
import { useTravels } from '@cc/web-data-access/travels';
import { Button } from '@cc/web-ui/components/Button';
import { EmptyState } from '@cc/web-ui/components/EmptyState';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { cn } from '@cc/web-ui/lib/utils';
import { Screen } from '../components/Screen';
import { BudgetBar } from '../components/budgets/BudgetBar';
import { TravelExistingSheet } from '../components/travels/TravelExistingSheet';
import { formatTravelRange, TravelForm } from '../components/travels/TravelForm';

interface TravelRowItem {
  travel: TravelView;
  state: TravelState;
  summary: TravelSummary | null;
  progress: BudgetProgress | null;
  budgetDef: BudgetDef | null;
}

function TravelSection({
  testId,
  heading,
  items,
  today,
}: {
  testId: string;
  heading: string;
  items: TravelRowItem[];
  today: string;
}): JSX.Element | null {
  const t = useT();
  if (items.length === 0) return null;

  return (
    <section data-testid={testId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="m-0 text-sm font-semibold text-muted-foreground">{heading}</h2>
      </div>
      <div className="rounded-xl bg-card divide-y divide-border overflow-hidden">
        {items.map(({ travel, state, summary, progress, budgetDef }) => {
          const firstCurrency = summary?.currencies[0] ?? null;
          const totalText = firstCurrency
            ? formatMoney(firstCurrency.total, firstCurrency.currency)
            : formatMoney(0, budgetDef?.currency ?? 'VND');
          const rangeText = formatTravelRange(travel.start, travel.end);

          const usedPct =
            progress && progress.limit > 0
              ? Math.min(100, Math.round((progress.spent / progress.limit) * 100))
              : 0;
          const todayPct = progress ? Math.round(progress.elapsed * 100) : undefined;

          let endingNode: JSX.Element | null = null;
          if (state === 'done') {
            if (progress && budgetDef) {
              const over = progress.spent > progress.limit;
              const diff = Math.abs(progress.limit - progress.spent);
              const text = over
                ? t('travels.over', {
                    amount: formatMoney(diff, budgetDef.currency),
                    limit: formatMoney(progress.limit, budgetDef.currency),
                  })
                : t('travels.under', {
                    amount: formatMoney(diff, budgetDef.currency),
                    limit: formatMoney(progress.limit, budgetDef.currency),
                  });
              endingNode = (
                <span className={cn(over ? 'text-danger' : 'text-muted-foreground')}>
                  {text}
                </span>
              );
            } else {
              endingNode = <span className="text-muted-foreground">{t('travels.noLimit')}</span>;
            }
          }

          return (
            <Link
              key={travel.id}
              to={`/travels/${encodeURIComponent(travel.id)}`}
              data-testid={`travel-row-${travel.id}`}
              className="fsl-travel-row w-full min-h-11 px-4 py-3 flex flex-col gap-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none no-underline text-foreground"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {travel.name}
                  </span>
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-1.5">
                    <span>{rangeText}</span>
                    {state === 'upcoming' && (
                      <span>{`· ${t('travels.bookDaysLeft', { n: daysUntil(travel, today) })}`}</span>
                    )}
                    {state === 'done' && endingNode && (
                      <>
                        <span>·</span>
                        {endingNode}
                      </>
                    )}
                  </div>
                </div>
                <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                  {totalText}
                </span>
              </div>

              {state === 'on' && progress && budgetDef && (
                <div className="flex flex-col gap-1">
                  <BudgetBar state={progress.state} used={usedPct} today={todayPct} />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {`${formatMoney(progress.spent, budgetDef.currency)} / ${formatMoney(progress.limit, budgetDef.currency)}`}
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function TravelsScreen(): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const today = todayLocal();

  const travelsQuery = useTravels();
  const walletsQuery = useWalletDetails();
  const source = useBudgetsSource({ enabled: true, allowServerFallback: true });
  const budgetsProgress = useBudgetsProgress();

  const [formOpen, setFormOpen] = useState(false);
  const [pendingExisting, setPendingExisting] = useState<{
    travelId: string;
    existing: TravelExisting;
  } | null>(null);

  const travels = travelsQuery.data?.travels ?? [];
  const wallets = walletsQuery.data?.wallets;

  const progressByBudgetId = useMemo(() => {
    const map = new Map<string, BudgetProgress>();
    const all = [
      ...budgetsProgress.groups.over,
      ...budgetsProgress.groups.fast,
      ...budgetsProgress.groups.onPace,
      ...budgetsProgress.groups.ended,
    ];
    for (const p of all) {
      map.set(p.budgetId, p);
    }
    return map;
  }, [budgetsProgress.groups]);

  const budgetDefById = useMemo(() => {
    const map = new Map<string, BudgetDef>();
    for (const d of budgetsProgress.defs) {
      map.set(d.id, d);
    }
    return map;
  }, [budgetsProgress.defs]);

  const sections = useMemo(() => {
    const on: TravelRowItem[] = [];
    const upcoming: TravelRowItem[] = [];
    const done: TravelRowItem[] = [];

    for (const travel of travels) {
      const state = travelState(travel, today);
      const summary =
        wallets && !source.isPending
          ? summarizeTravel(travel, source.rows, wallets, source.categories)
          : null;
      const progress = travel.budgetId ? progressByBudgetId.get(travel.budgetId) ?? null : null;
      const budgetDef = travel.budgetId ? budgetDefById.get(travel.budgetId) ?? null : null;

      const item: TravelRowItem = { travel, state, summary, progress, budgetDef };
      if (state === 'on') on.push(item);
      else if (state === 'upcoming') upcoming.push(item);
      else done.push(item);
    }

    upcoming.sort((a, b) => a.travel.start.localeCompare(b.travel.start));
    done.sort((a, b) => b.travel.end.localeCompare(a.travel.end));

    return { on, upcoming, done };
  }, [travels, today, wallets, source.isPending, source.rows, source.categories, progressByBudgetId, budgetDefById]);

  const handleSaved = (res: TravelSavedResponse) => {
    setFormOpen(false);
    const totalExisting = res.existing.own.count + res.existing.shares.count;
    if (totalExisting > 0) {
      setPendingExisting({ travelId: res.travel.id, existing: res.existing });
    } else {
      navigate(`/travels/${encodeURIComponent(res.travel.id)}`);
    }
  };

  const handleExistingDone = () => {
    const id = pendingExisting?.travelId;
    setPendingExisting(null);
    if (id) {
      navigate(`/travels/${encodeURIComponent(id)}`);
    }
  };

  const isLoading = travelsQuery.isPending && travels.length === 0;
  const error = travelsQuery.error;

  return (
    <Screen
      title={t('travels.listTitle')}
      back="/trips"
      bottomBar={
        travels.length > 0 ? (
          <Button
            type="button"
            variant="primary"
            block
            data-testid="travels-new-button"
            onClick={() => setFormOpen(true)}
          >
            {`+ ${t('travels.newTrip')}`}
          </Button>
        ) : undefined
      }
    >
      <div className="fsl-travels flex flex-col gap-4">
        {isLoading ? (
          <SkeletonList rows={3} />
        ) : error && travels.length === 0 ? (
          <InlineError error={error} onRetry={() => travelsQuery.refetch()} />
        ) : travels.length === 0 ? (
          <EmptyState
            icon="plane"
            title={t('travels.listTitle')}
            body={t('travels.empty')}
            action={
              <Button
                type="button"
                variant="primary"
                block
                data-testid="travels-empty-add"
                onClick={() => setFormOpen(true)}
              >
                {`+ ${t('travels.newTrip')}`}
              </Button>
            }
          />
        ) : (
          <>
            <TravelSection
              testId="travels-section-on"
              heading={t('travels.sectionOn')}
              items={sections.on}
              today={today}
            />
            <TravelSection
              testId="travels-section-upcoming"
              heading={t('travels.sectionUpcoming')}
              items={sections.upcoming}
              today={today}
            />
            <TravelSection
              testId="travels-section-done"
              heading={t('travels.sectionDone')}
              items={sections.done}
              today={today}
            />
          </>
        )}
      </div>

      <TravelForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={handleSaved} />

      <TravelExistingSheet
        travelId={pendingExisting?.travelId ?? null}
        existing={pendingExisting?.existing ?? null}
        onDone={handleExistingDone}
      />
    </Screen>
  );
}
