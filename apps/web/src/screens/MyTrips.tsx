import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { TripListItem } from '@fsl/core';
import { useT } from '../i18n';
import { useMe } from '../api/hooks';
import { apiFetch } from '../api/client';
import { Screen } from '../components/Screen';
import { ConsentSheet } from '../components/ConsentSheet';
import { SkeletonList } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { InlineError } from '../components/InlineError';
import { Amount } from '../components/Amount';
import { AccountMenu } from '../components/AccountMenu';
import { Button } from '../components/Button';
import { Snackbar } from '../components/Snackbar';
import { MergeRequestBanner } from '../components/MergeRequestBanner';
import { Icon } from '../components/icons';
import { cn } from '@/lib/utils';

export function MyTrips() {
  const t = useT();
  const navigate = useNavigate();

  const meQuery = useMe();

  const tripsQuery = useQuery<TripListItem[]>({
    queryKey: ['trips'],
    queryFn: () => apiFetch<TripListItem[]>('/api/trips'),
    enabled: meQuery.data?.user !== null,
  });

  const user = meQuery.data?.user;
  const [searchParams] = useSearchParams();
  const mergeReview = searchParams.get('mergeReview');
  const [noRequest, setNoRequest] = useState(false);
  const incoming = meQuery.data?.mergeRequests.incoming ?? [];
  const [reviewedId, setReviewedId] = useState<string | null>(null);
  const reviewMatch = mergeReview ? incoming.find((r) => r.id === mergeReview) : undefined;
  const incomingMerge = reviewMatch ?? incoming.find((r) => r.id === reviewedId) ?? incoming[0];

  // Only decide once /api/me has loaded; then drop just the mergeReview parameter.
  useEffect(() => {
    if (!meQuery.isSuccess || !mergeReview) return;
    if (reviewMatch) setReviewedId(reviewMatch.id);
    else setNoRequest(true);
    const rest = new URLSearchParams(searchParams);
    rest.delete('mergeReview');
    const search = rest.toString();
    navigate({ search: search ? `?${search}` : '' }, { replace: true });
  }, [meQuery.isSuccess, mergeReview, reviewMatch, searchParams, navigate]);

  useEffect(() => {
    if (!noRequest) return;
    const id = setTimeout(() => setNoRequest(false), 4000);
    return () => clearTimeout(id);
  }, [noRequest]);

  useEffect(() => {
    if (meQuery.isSuccess && user === null) {
      navigate('/', { replace: true });
    }
  }, [meQuery.isSuccess, user, navigate]);

  const isEmpty = tripsQuery.isSuccess && tripsQuery.data.length === 0;

  return (
    <Screen
      title={t('trips.title')}
      right={user ? <AccountMenu user={user} /> : undefined}
    >
      <ConsentSheet />
      <div className="fsl-my-trips flex flex-col gap-4 py-4">
        {incomingMerge && (
          <MergeRequestBanner
            key={incomingMerge.id}
            request={incomingMerge}
            autoOpen={!!reviewMatch}
          />
        )}
        {!isEmpty && (
          <Button variant="primary" block href="/trips/new">
            {t('trips.new')}
          </Button>
        )}

        {meQuery.isLoading || tripsQuery.isLoading ? (
          <SkeletonList rows={3} />
        ) : tripsQuery.isError ? (
          <InlineError
            error={tripsQuery.error}
            onRetry={() => tripsQuery.refetch()}
          />
        ) : isEmpty ? (
          <EmptyState
            icon="suitcase"
            title={t('trips.emptyTitle')}
            action={
              <>
                <p className="fsl-my-trips__empty-body m-0 mb-3 text-base text-muted-foreground">{t('trips.emptyBody')}</p>
                <Button variant="primary" block href="/trips/new">
                  {t('trips.new')}
                </Button>
              </>
            }
          />
        ) : (
          <div className="fsl-my-trips__list bg-card border border-border rounded-xl overflow-hidden">
            {tripsQuery.data?.map((trip) => {
              const tone =
                trip.myBalance > 0
                  ? 'success'
                  : trip.myBalance < 0
                    ? 'danger'
                    : 'neutral';
              const label =
                trip.myBalance > 0
                  ? t('trips.youreOwed')
                  : trip.myBalance < 0
                    ? t('trips.youOwe')
                    : t('trips.settled');

              return (
                <Link
                  key={trip.id}
                  to={`/t/${trip.id}`}
                  className="fsl-my-trips__row flex items-center justify-between gap-3 px-4 py-3 min-h-[56px] text-foreground border-b border-border last:border-b-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors motion-reduce:transition-none"
                >
                  <div className="fsl-my-trips__row-info flex flex-col gap-1 min-w-0 flex-1">
                    <span className="fsl-my-trips__row-name truncate text-base font-semibold text-foreground">{trip.name}</span>
                    <span className="fsl-my-trips__row-sub text-sm leading-snug">
                      <span
                        className={cn(
                          'fsl-my-trips__line',
                          `fsl-my-trips__line--${tone}`,
                          tone === 'success' && 'text-success',
                          tone === 'danger' && 'text-danger',
                          tone === 'neutral' && 'text-muted-foreground',
                        )}
                      >
                        {label}
                        {trip.myBalance !== 0 && (
                          <>
                            {' '}
                            <Amount
                              value={Math.abs(trip.myBalance)}
                              tone={tone}
                            />
                          </>
                        )}
                      </span>
                      {trip.archived && (
                        <span className="fsl-my-trips__archived text-muted-foreground"> · {t('trips.archived')}</span>
                      )}
                    </span>
                  </div>
                  <Icon
                    name="chevronRight"
                    size={20}
                    className="fsl-my-trips__chevron text-subtle-foreground shrink-0"
                  />
                </Link>
              );
            })}
          </div>
        )}
      </div>
      {noRequest && <Snackbar message={t('merge.noRequestHere')} />}
    </Screen>
  );
}
