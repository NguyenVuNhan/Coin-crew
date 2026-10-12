import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTripView } from '../api/hooks';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import { GuestTrip } from './GuestTrip';
import { ViewOnlyTrip } from './ViewOnlyTrip';
import { Placeholder } from './Placeholder';

export function TripRoute() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();

  const { view, error, isLoading, refetch } = useTripView(tripId ?? '', 20000);

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

  if (view.me.kind === 'guest') {
    if (view.me.participantId === null) {
      return null;
    }
    return <GuestTrip view={view} />;
  }

  if (view.me.kind === 'viewer') {
    return <ViewOnlyTrip view={view} />;
  }

  return <Placeholder />;
}
