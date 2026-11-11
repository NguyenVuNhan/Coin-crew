import type { JSX } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TripView } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { useGroupPersonHistory, useLedger } from '@cc/web-data-access/people';
import { Avatar } from '@cc/web-ui/components/Avatar';
import { Button } from '@cc/web-ui/components/Button';
import { InlineError } from '@cc/web-ui/components/InlineError';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { Screen } from '../components/Screen';
import { HistoryList } from '../components/HistoryList';
import { PersonTotal } from './PersonTotal';

/** `/people/in/:tripId/:pid`: the lines between me and one person inside one group. */
export function PersonGroupHistory({ tripId, pid }: { tripId: string; pid: string }): JSX.Element {
  const t = useT();
  const qc = useQueryClient();
  const { ledger } = useLedger();
  const nav = { section: 'home' as const, addHref: ledger ? `/t/${ledger.tripId}/expenses/new` : '/trips' };
  const back = `/t/${tripId}`;

  const { data, isLoading, error, refetch } = useGroupPersonHistory(tripId, pid);

  if (isLoading) {
    return (
      <Screen title={t('person.title')} back={back} nav={nav}>
        <SkeletonList rows={3} />
      </Screen>
    );
  }

  const place = data?.places[0];
  if (error || !data || !place) {
    return (
      <Screen title={t('person.title')} back={back} nav={nav}>
        <InlineError error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const history = place.history;
  const lines = history?.lines ?? [];
  // Only a trip view already in the cache names the person the money moved to; no extra fetch.
  const viaPid = history?.gap?.kind === 'reroute' ? history.gap.viaPid : null;
  const viaName = viaPid
    ? (qc.getQueryData<TripView>(['trip', tripId])?.people.find((p) => p.id === viaPid)?.name ?? null)
    : null;
  const settled = place.amount === 0 && lines.length === 0;

  return (
    <Screen title={data.name} back={back} nav={nav}>
      <div className="fsl-person flex flex-col gap-6 py-2">
        <div className="fsl-person__header flex flex-col items-center gap-2 text-center">
          <Avatar size="xl" name={data.name} />
          <div className="flex flex-col items-center gap-0.5">
            <h2 className="text-xl font-semibold text-foreground m-0">{data.name}</h2>
            <span className="fsl-person__group text-sm text-muted-foreground">{place.tripName}</span>
          </div>
        </div>

        <PersonTotal total={place.amount} />

        {!settled && history && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground px-1 m-0">{t('history.title')}</h3>
            <HistoryList
              lines={lines}
              otherName={data.name}
              summary={{ twoWay: history.twoWay, suggested: history.suggested, gap: history.gap, viaName }}
            />
          </div>
        )}

        <div className="fsl-person__actions flex flex-col gap-2">
          <Button variant="ghost" block href={`/people/${encodeURIComponent(data.key)}`}>
            {t('history.seeAll', { name: data.name })}
          </Button>
        </div>
      </div>
    </Screen>
  );
}
