import { useEffect } from 'react';
import { Navigate, useLocation, useMatch, useNavigate, useParams, useSearchParams } from 'react-router';
import type { TripView } from '@fsl/core';
import { useMe, useTripView } from '../api/hooks';
import { useLedger } from '../api/people';
import { useIsWide } from '../lib/media';
import { homeDetailsHref, useBackToTrip, useListScroll } from '../lib/detailsNav';
import { Screen } from '../components/Screen';
import { LanguageButton } from '../components/LanguageButton';
import { TripLayout } from '../components/TripLayout';
import { Skeleton, SkeletonList } from '../components/Skeleton';
import { InlineError } from '../components/InlineError';
import { NoAccess } from '../components/NoAccess';
import { Button } from '../components/Button';
import { ExpenseDetails } from '../components/ExpenseDetails';
import { PaymentDetails } from '../components/PaymentDetails';
import { IncomeDetails } from '../components/IncomeDetails';
import { useT, applyInheritedLang } from '../i18n';
import { GuestTrip } from './GuestTrip';
import { ViewOnlyTrip } from './ViewOnlyTrip';
import { MemberTrip } from './MemberTrip';
import { Approvals } from './Approvals';
import { RatingsScreen } from './RatingsScreen';
import { cn } from '@/lib/utils';

/** What the address points at inside the trip: the transaction whose details are open, the approvals list, or player ratings. */
export type Selection =
  | { kind: 'expense'; id: string }
  | { kind: 'payment'; id: string }
  | { kind: 'income'; id: string }
  | { kind: 'approvals' }
  | { kind: 'ratings' };

function selectionFrom(params: { expenseId?: string; paymentId?: string; incomeId?: string }): Selection | null {
  if (params.expenseId) return { kind: 'expense', id: params.expenseId };
  if (params.paymentId) return { kind: 'payment', id: params.paymentId };
  if (params.incomeId) return { kind: 'income', id: params.incomeId };
  return null;
}

/** The details of one expense, payment or fund income as a page of its own (phones); back returns to the list where it was left. */
function DetailsPage({ view, selection }: { view: TripView; selection: Exclude<Selection, { kind: 'approvals' } | { kind: 'ratings' }> }) {
  const t = useT();
  // The ledger has no page of its own: its details go back to the main screen.
  const goBack = useBackToTrip(view.trip.id, view.trip.preset === 'direct' ? '/trips' : undefined);
  return (
    <Screen
      title={selection.kind === 'expense' ? t('details.expense') : selection.kind === 'income' ? t('details.income') : t('details.payment')}
      onBack={goBack}
    >
      {selection.kind === 'expense' ? (
        <ExpenseDetails key={selection.id} view={view} expenseId={selection.id} onClose={goBack} />
      ) : selection.kind === 'income' ? (
        <IncomeDetails key={selection.id} view={view} incomeId={selection.id} onClose={goBack} />
      ) : (
        <PaymentDetails key={selection.id} view={view} paymentId={selection.id} onClose={goBack} />
      )}
    </Screen>
  );
}

/** The trip page while it loads: balance card, three transfer rows and four expense rows, in the page's own columns. */
function TripSkeleton({ wide }: { wide: boolean }) {
  const balance = <Skeleton height={96} radius="lg" />;
  const transfers = <SkeletonList rows={3} />;
  const expenses = <SkeletonList rows={4} />;
  return (
    <div className="fsl-trip-skeleton flex flex-col gap-4 py-4">
      {wide ? (
        <TripLayout left={expenses} right={<>{balance}{transfers}</>} />
      ) : (
        <>
          {balance}
          {transfers}
          {expenses}
        </>
      )}
    </div>
  );
}

export function TripRoute() {
  const { tripId, expenseId, paymentId, incomeId } = useParams<{ tripId: string; expenseId: string; paymentId: string; incomeId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const wide = useIsWide();
  const user = useMe().data?.user;
  const { ledger } = useLedger();
  const onApprovals = useMatch('/t/:tripId/approvals') !== null;
  const onRatings = useMatch('/t/:tripId/ratings') !== null;
  const selection: Selection | null = onApprovals
    ? { kind: 'approvals' }
    : onRatings
      ? { kind: 'ratings' }
      : selectionFrom({ expenseId, paymentId, incomeId });

  // Polling pauses after 15 minutes so a forgotten tab doesn't use up the free plan (spec §5).
  const { view, error, isLoading, refetch, stopped, resume } = useTripView(tripId ?? '', 20000, { stopAfterMs: 15 * 60_000 });

  useEffect(() => {
    applyInheritedLang(searchParams.get('lang'), view?.trip.defaultLang);
  }, [searchParams, view?.trip.defaultLang]);

  // Phones show the details, the approvals list, and player ratings as a page of their own; from 1024px every trip page
  // (member, guest and view-only) shows them in its right panel (it takes `selection`).
  const detail = selection && selection.kind !== 'approvals' && selection.kind !== 'ratings' && !wide ? selection : null;
  const approvalsPage = selection?.kind === 'approvals' && !wide;
  const ratingsPage = selection?.kind === 'ratings' && !wide;
  useListScroll(detail !== null ? 'details' : approvalsPage ? 'approvals' : ratingsPage ? 'ratings' : 'list');

  useEffect(() => {
    if (view && view.me.kind === 'guest' && view.me.participantId === null && tripId) {
      navigate(`/t/${tripId}/who?next=` + encodeURIComponent(location.pathname + location.search), { replace: true });
    }
  }, [view, tripId, navigate, location.pathname, location.search]);

  // A shared link's visitor sees these first, so they carry the language switch.
  if (isLoading) {
    return (
      <Screen title="" right={<LanguageButton />} wide>
        <TripSkeleton wide={wide} />
      </Screen>
    );
  }

  if (error) {
    const forbiddenNav =
      error.code === 'FORBIDDEN' && user
        ? {
            section: 'groups' as const,
            addHref: ledger ? `/t/${ledger.tripId}/expenses/new` : '/trips',
          }
        : undefined;

    return (
      <Screen title="" right={<LanguageButton />} nav={forbiddenNav}>
        {error.code === 'FORBIDDEN' ? (
          <NoAccess returnTo={location.pathname + location.search} />
        ) : (
          <InlineError error={error} onRetry={refetch} />
        )}
      </Screen>
    );
  }

  if (!view) {
    return null;
  }

  if (view.me.kind === 'guest' && view.me.participantId === null) {
    return null;
  }

  if (view.trip.preset === 'direct' && selection === null) {
    return <Navigate to="/trips" replace />;
  }

  // From 1024px the caller's own ledger items open on the main screen, in its right column (never the ledger as a group).
  if (view.trip.preset === 'direct' && view.me.isOrganiser && wide && selection && (selection.kind === 'expense' || selection.kind === 'payment' || selection.kind === 'income')) {
    return <Navigate to={homeDetailsHref(selection.kind, selection.id)} replace />;
  }

  // Only members have anything to approve: a guest or a view-only link to the list lands on the trip.
  if (selection?.kind === 'approvals' && view.me.kind !== 'member') {
    return <Navigate to={`/t/${view.trip.id}`} replace />;
  }

  // If ratings are not enabled, visiting /ratings redirects back to the trip page.
  if (selection?.kind === 'ratings' && (view.trip.preset !== 'sport' || !view.ratings?.enabled)) {
    return <Navigate to={`/t/${view.trip.id}`} replace />;
  }

  const page =
    detail ? (
      <DetailsPage view={view} selection={detail} />
    ) : approvalsPage ? (
      <Approvals view={view} />
    ) : ratingsPage ? (
      <RatingsScreen view={view} />
    ) : view.me.kind === 'guest' ? (
      <GuestTrip view={view} selection={selection} />
    ) : view.me.kind === 'viewer' ? (
      <ViewOnlyTrip view={view} selection={selection} />
    ) : (
      <MemberTrip view={view} selection={selection} />
    );
  // Member and view-only lists carry the app nav for signed-in callers; below 1024px its floating footer sits at the
  // bottom, so the resume bar goes above it, where the Snackbar sits.
  const hasNav = Boolean(user) && view.me.kind !== 'guest' && !detail && !approvalsPage && !ratingsPage;
  return (
    <>
      {page}
      {stopped && (
        <div
          data-testid="resume-bar"
          className={cn(
            'fsl-resume-bar fixed left-1/2 -translate-x-1/2 shadow-lg rounded-full z-10',
            hasNav
              ? 'bottom-[calc(72px+env(safe-area-inset-bottom,0px)+12px)] lg:bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]'
              : 'bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]',
          )}
        >
          <Button onClick={() => { resume(); refetch(); }}>{t('pay.tapToCheck')}</Button>
        </div>
      )}
    </>
  );
}
