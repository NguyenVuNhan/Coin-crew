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
import './Activity.css';

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
      <div className="fsl-activity">
        {loading && !error && <SkeletonList rows={5} />}

        {error && (
          <InlineError error={error as ApiClientError} onRetry={refetch} />
        )}

        {!loading && !error && (!data || data.length === 0) && (
          <EmptyState icon="clock" title={t('activity.empty')} action={null} />
        )}

        {!loading && !error && data && data.length > 0 &&
          groupByDay(data, new Date()).map((group) => (
            <section key={group.label} className="fsl-activity__day">
              <h2 className="fsl-activity__heading">{group.label}</h2>
              <ul className="fsl-activity__list">
                {group.items.map((item) => (
                  <li key={item.id} className="fsl-activity__row">
                    <div className="fsl-activity__line">{activityLine(item, view, t)}</div>
                    <div className="fsl-activity__meta">
                      {timeOf(item.createdAt)}{item.deviceShort ? <> · {t('activity.device')} <code className="fsl-activity__device">{item.deviceShort}</code></> : null}
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
