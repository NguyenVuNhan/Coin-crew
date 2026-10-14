import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import type { TripView } from '@fsl/core';
import { useTripView } from '../api/hooks';
import { useIsWide } from '../lib/media';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import { Button } from '../components/Button';
import { ExpenseDetails } from '../components/ExpenseDetails';
import { PaymentDetails } from '../components/PaymentDetails';
import { useT } from '../i18n';
import './TripRoute.css';
import { GuestTrip } from './GuestTrip';
import { ViewOnlyTrip } from './ViewOnlyTrip';
import { MemberTrip } from './MemberTrip';

/** What the address points at inside the trip: the transaction whose details are open, or the approvals list. */
export type Selection = { kind: 'expense'; id: string } | { kind: 'payment'; id: string } | { kind: 'approvals' };

function selectionFrom(params: { expenseId?: string; paymentId?: string }): Selection | null {
  if (params.expenseId) return { kind: 'expense', id: params.expenseId };
  if (params.paymentId) return { kind: 'payment', id: params.paymentId };
  return null;
}

/** The details of one expense or payment as a page of its own (phones); back returns to the trip. */
function DetailsPage({ view, selection }: { view: TripView; selection: Exclude<Selection, { kind: 'approvals' }> }) {
  const t = useT();
  const navigate = useNavigate();
  const tripPath = `/t/${view.trip.id}`;
  const close = () => navigate(tripPath);
  return (
    <Screen title={selection.kind === 'expense' ? t('details.expense') : t('details.payment')} back={tripPath}>
      {selection.kind === 'expense' ? (
        <ExpenseDetails view={view} expenseId={selection.id} onClose={close} />
      ) : (
        <PaymentDetails view={view} paymentId={selection.id} onClose={close} />
      )}
    </Screen>
  );
}

export function TripRoute() {
  const { tripId, expenseId, paymentId } = useParams<{ tripId: string; expenseId: string; paymentId: string }>();
  const navigate = useNavigate();
  const t = useT();
  const wide = useIsWide();
  const selection = selectionFrom({ expenseId, paymentId });

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

  // Phones show the details as a page of their own; from 1024px the trip page shows them in its right panel (the trip page takes `selection`).
  const page =
    selection && selection.kind !== 'approvals' && !wide ? (
      <DetailsPage view={view} selection={selection} />
    ) : view.me.kind === 'guest' ? (
      <GuestTrip view={view} selection={selection} />
    ) : view.me.kind === 'viewer' ? (
      <ViewOnlyTrip view={view} selection={selection} />
    ) : (
      <MemberTrip view={view} selection={selection} />
    );
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
