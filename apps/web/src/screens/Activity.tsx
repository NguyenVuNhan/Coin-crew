import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ActivityItem } from '@fsl/core';
import type { MessageKey } from '../i18n/en';
import { useT } from '../i18n';
import { apiFetch, type ApiClientError } from '../api/client';
import { formatAgo } from '../lib/time';
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

  return (
    <Screen title={t('activity.title')} back={`/t/${tripId}/settings`}>
      <div className="fsl-activity">
        {isLoading && <SkeletonList rows={5} />}

        {error && (
          <InlineError error={error as ApiClientError} onRetry={refetch} />
        )}

        {!isLoading && !error && (!data || data.length === 0) && (
          <EmptyState title={t('activity.empty')} action={null} />
        )}

        {!isLoading && !error && data && data.length > 0 && (
          <div className="fsl-card">
            {data.map((item) => {
              const actionKey = `activity.action.${item.action}` as MessageKey;
              const line = t('activity.line', {
                actor: item.actorName ?? t('activity.someone'),
                action: t(actionKey),
              });
              const meta =
                formatAgo(item.createdAt) +
                (item.deviceShort ? ` · ${item.deviceShort}` : '');

              return (
                <div key={item.id} className="fsl-activity__row">
                  <div className="fsl-activity__line">{line}</div>
                  <div className="fsl-activity__meta">{meta}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Screen>
  );
}
