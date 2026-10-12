import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { TripListItem } from '@fsl/core';
import { useT } from '../i18n';
import { apiFetch } from '../api/client';
import { Screen } from '../components/Screen';
import { LangSwitch } from '../components/LangSwitch';
import { ConsentSheet } from '../components/ConsentSheet';
import { SkeletonList } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { InlineError } from '../components/InlineError';
import { Amount } from '../components/Amount';
import { Pill } from '../components/Pill';
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

  return (
    <Screen title={t('trips.title')} right={<LangSwitch />}>
      <ConsentSheet />
      <div className="fsl-my-trips">
        <div className="fsl-my-trips__header-action">
          <Link
            to="/trips/new"
            className="fsl-button fsl-button--primary fsl-button--block"
          >
            {t('trips.new')}
          </Link>
        </div>

        {meQuery.isLoading || tripsQuery.isLoading ? (
          <SkeletonList rows={3} />
        ) : tripsQuery.isError ? (
          <InlineError
            error={tripsQuery.error}
            onRetry={() => tripsQuery.refetch()}
          />
        ) : !tripsQuery.data || tripsQuery.data.length === 0 ? (
          <EmptyState title={t('trips.empty')} action={null} />
        ) : (
          <div className="fsl-my-trips__list">
            {tripsQuery.data.map((trip) => {
              const balanceTone =
                trip.myBalance > 0
                  ? 'success'
                  : trip.myBalance < 0
                    ? 'danger'
                    : 'neutral';
              const balanceLabel =
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
                    <div className="fsl-my-trips__row-sub">
                      <span>{balanceLabel}</span>
                      {trip.archived && (
                        <Pill tone="neutral">{t('trips.archived')}</Pill>
                      )}
                    </div>
                  </div>
                  <div className="fsl-my-trips__row-amount">
                    <Amount
                      value={Math.abs(trip.myBalance)}
                      tone={balanceTone}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Screen>
  );
}
