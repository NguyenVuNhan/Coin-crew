import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ActivityItem } from '@fsl/core';
import { useT } from '../i18n';
import { apiFetch, type ApiClientError } from '../api/client';
import { useTripView } from '../api/hooks';
import { activityLine, groupByDay, timeOf } from '../lib/activityText';
import { Screen } from '../components/Screen';
import { SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import { EmptyState } from '../components/EmptyState';
import { cn } from '@/lib/utils';

export function Activity() {
  const { tripId } = useParams<{ tripId: string }>();
  const t = useT();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['activity', tripId],
    queryFn: () => apiFetch<ActivityItem[]>(`/api/trips/${tripId}/activity`, { tripId }),
    enabled: !!tripId,
  });

  const { view, isLoading: viewLoading } = useTripView(tripId ?? '', 0);
  const loading = isLoading || viewLoading;

  return (
    <Screen title={t('activity.title')} back={`/t/${tripId}/settings`}>
      <div className={cn('fsl-activity flex flex-col gap-4 py-4')}>
        {loading && !error && <SkeletonList rows={5} />}

        {error && (
          <InlineError error={error as ApiClientError} onRetry={refetch} />
        )}

        {!loading && !error && (!data || data.length === 0) && (
          <EmptyState icon="clock" title={t('activity.empty')} action={null} />
        )}

        {!loading && !error && data && data.length > 0 &&
          groupByDay(data, new Date()).map((group) => (
            <section key={group.label} className={cn('fsl-activity__day flex flex-col gap-2')}>
              <h2 className={cn('fsl-activity__heading m-0 text-sm font-semibold text-muted-foreground')}>{group.label}</h2>
              <ul className={cn('fsl-activity__list list-none m-0 p-0 bg-card rounded-xl border border-border divide-y divide-border overflow-hidden')}>
                {group.items.map((item) => (
                  <li key={item.id} className={cn('fsl-activity__row flex flex-col gap-1 px-4 py-3 min-h-11')}>
                    <div className={cn('fsl-activity__line text-base font-medium text-foreground [overflow-wrap:anywhere]')}>{activityLine(item, view, t)}</div>
                    <div className={cn('fsl-activity__meta text-sm text-muted-foreground tabular-nums')}>
                      {timeOf(item.createdAt)}{item.deviceShort ? <> · {t('activity.device')} <code className={cn('fsl-activity__device font-mono text-xs text-muted-foreground')}>{item.deviceShort}</code></> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </Screen>
  );
}
