import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTripView } from '../api/hooks';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import { Button } from '../components/Button';
import { useT } from '../i18n';
import './TripRoute.css';
import { GuestTrip } from './GuestTrip';
import { ViewOnlyTrip } from './ViewOnlyTrip';
import { MemberTrip } from './MemberTrip';

export function TripRoute() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const t = useT();

  // Polling pauses after 15 minutes so a forgotten tab doesn't use up the free plan (spec §5).
  const { view, error, isLoading, refetch, stopped, resume } = useTripView(tripId ?? '', 20000, { stopAfterMs: 15 * 60_000 });

  useEffect(() => {
    if (view && view.me.kind === 'guest' && view.me.participantId === null && tripId) {
      navigate(`/t/${tripId}/who`, { replace: true });
    }
  }, [view, tripId, navigate]);

  if (isLoading) {
    return (
      <Screen title="">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            padding: 'var(--space-4) 0',
          }}
        >
          <Skeleton height={140} radius="lg" />
          <SkeletonList rows={4} />
        </div>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="">
        <InlineError error={error} onRetry={refetch} />
      </Screen>
    );
  }

  if (!view) {
    return null;
  }

  if (view.me.kind === 'guest' && view.me.participantId === null) {
    return null;
  }

  const page = view.me.kind === 'guest' ? <GuestTrip view={view} /> : view.me.kind === 'viewer' ? <ViewOnlyTrip view={view} /> : <MemberTrip view={view} />;
  return (
    <>
      {page}
      {stopped && (
        <div className="fsl-resume-bar">
          <Button onClick={() => { resume(); refetch(); }}>{t('pay.tapToCheck')}</Button>
        </div>
      )}
    </>
  );
}
