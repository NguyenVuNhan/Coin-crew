import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { TripListItem } from '@fsl/core';
import { useT } from '../i18n';
import { apiFetch } from '../api/client';
import { Screen } from '../components/Screen';
import { ConsentSheet } from '../components/ConsentSheet';
import { SkeletonList } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { InlineError } from '../components/InlineError';
import { Amount } from '../components/Amount';
import { AccountMenu } from '../components/AccountMenu';
import { Button } from '../components/Button';
import { Icon } from '../components/icons';
import './MyTrips.css';

interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    consentAt: string | null;
  } | null;
}

export function MyTrips() {
  const t = useT();
  const navigate = useNavigate();

  const meQuery = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeResponse>('/api/me'),
  });

  const tripsQuery = useQuery<TripListItem[]>({
    queryKey: ['trips'],
    queryFn: () => apiFetch<TripListItem[]>('/api/trips'),
    enabled: meQuery.data?.user !== null,
  });

  const user = meQuery.data?.user;

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
      <div className="fsl-my-trips">
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
                <p className="fsl-my-trips__empty-body">{t('trips.emptyBody')}</p>
                <Button variant="primary" block href="/trips/new">
                  {t('trips.new')}
                </Button>
              </>
            }
          />
        ) : (
          <div className="fsl-my-trips__list">
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
                  className="fsl-my-trips__row"
                >
                  <div className="fsl-my-trips__row-info">
                    <span className="fsl-my-trips__row-name">{trip.name}</span>
                    <span className="fsl-my-trips__row-sub">
                      <span className={`fsl-my-trips__line fsl-my-trips__line--${tone}`}>
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
                        <span className="fsl-my-trips__archived"> · {t('trips.archived')}</span>
                      )}
                    </span>
                  </div>
                  <Icon
                    name="chevronRight"
                    size={20}
                    className="fsl-my-trips__chevron"
                  />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Screen>
  );
}
