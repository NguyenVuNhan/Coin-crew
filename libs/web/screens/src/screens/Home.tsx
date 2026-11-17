import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useT } from '@cc/web-i18n';
import { useMe, useTripView } from '@cc/web-data-access/hooks';
import { useLedger } from '@cc/web-data-access/people';
import { useIsWide } from '@cc/web-util/media';
import { homeDetailsFrom, ledgerDetailsPath, useOpenDetails, type HomeDetailKind } from '../lib/detailsNav';
import { useBack, useEntryState, useNavEntry } from '../lib/navHistory';
import { Screen } from '../components/Screen';
import { AccountMenu } from '../components/AccountMenu';
import { FeedbackButton } from '../components/FeedbackButton';
import { ConsentSheet } from '../components/ConsentSheet';
import { InstallPill } from '../components/InstallPill';
import { PushPill } from '../components/PushPill';
import { SkeletonList } from '@cc/web-ui/components/Skeleton';
import { TripTabs } from '../components/TripTabs';
import { ExpenseList } from '../components/ExpenseList';
import { PaymentsList } from '../components/PaymentsList';
import { TripLayout } from '../components/TripLayout';
import type { Selection } from './TripRoute';
import { DetailsPanel } from './DetailsPanel';
import { PeopleByPerson, PeopleTotalCard } from '../components/PeopleSummary';

export interface HomeProps {
  title?: string;
  summary?: ReactNode;
  wideMain?: ReactNode;
  rightExtra?: ReactNode;
}

export function Home({
  title,
  summary = (
    <>
      <PeopleTotalCard />
      <PeopleByPerson />
    </>
  ),
  wideMain,
  rightExtra,
}: HomeProps = {}): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const wide = useIsWide();
  const { depth, openedAs } = useNavEntry();
  const { goBack } = useBack('/trips');
  const meQuery = useMe();
  const user = meQuery.data?.user;

  const { ledger, isLoading: ledgerLoading } = useLedger();
  const { view: ledgerView, isLoading: ledgerViewLoading } = useTripView(ledger?.tripId ?? '', 0);

  const [activeTab, setActiveTab] = useEntryState<'expenses' | 'payments'>('tab', 'expenses');
  // From 1024px the open transaction lives in the search params (`/trips?expense=<id>`), so Activity, an edit's
  // return and a deep link to a ledger item all land here with it open.
  const [searchParams, setSearchParams] = useSearchParams();
  const fromSearch = homeDetailsFrom(searchParams);
  const selection: Selection | null = wide ? fromSearch : null;
  const openDetails = useOpenDetails(ledger?.tripId ?? '');

  const select = useCallback(
    (kind: HomeDetailKind, id: string) => setSearchParams({ [kind]: id }, { replace: true }),
    [setSearchParams],
  );
  // Closing clears the main screen's own selection: no detour through the ledger's address.
  const closeDetails = useCallback(() => {
    const openedParams = openedAs ? new URL(openedAs, 'http://x').searchParams : null;
    const hasItemParam =
      openedParams !== null &&
      (openedParams.has('expense') || openedParams.has('payment') || openedParams.has('income'));
    if (depth > 0 && hasItemParam) {
      goBack();
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const kind of ['expense', 'payment', 'income']) next.delete(kind);
        return next;
      },
      { replace: true },
    );
  }, [depth, openedAs, goBack, setSearchParams]);

  useEffect(() => {
    if (meQuery.isSuccess && user === null) {
      navigate('/', { replace: true });
    }
  }, [meQuery.isSuccess, user, navigate]);

  // Phones show details as a page of their own.
  const phoneDetail = !wide && fromSearch && ledger ? ledgerDetailsPath(ledger.tripId, fromSearch.kind, fromSearch.id) : null;
  useEffect(() => {
    if (phoneDetail) navigate(phoneDetail, { replace: true });
  }, [phoneDetail, navigate]);

  const handleOpen = (kind: HomeDetailKind) => (id: string) => {
    if (wide && ledgerView) select(kind, id);
    else if (ledger) openDetails(kind, id);
  };
  const handleOpenExpense = handleOpen('expense');
  const handleOpenPayment = handleOpen('payment');
  const handleOpenIncome = handleOpen('income');

  const navProps = ledger
    ? { section: 'home' as const, addHref: `/t/${ledger.tripId}/expenses/new` }
    : undefined;

  const groupLists =
    ledgerLoading || ledgerViewLoading ? (
      <SkeletonList rows={4} />
    ) : ledgerView ? (
      <>
        <ExpenseList
          view={ledgerView}
          selectedId={selection?.kind === 'expense' ? selection.id : undefined}
          onOpen={handleOpenExpense}
          onOpenIncome={handleOpenIncome}
          hintable={true}
        />
        <PaymentsList
          view={ledgerView}
          selectedId={selection?.kind === 'payment' ? selection.id : undefined}
          onOpen={handleOpenPayment}
          hintable={false}
        />
      </>
    ) : null;

  return (
    <Screen
      title={title ?? t('home.title')}
      right={
        user ? (
          <>
            {rightExtra}
            <FeedbackButton signedIn />
            <AccountMenu user={user} />
          </>
        ) : undefined
      }
      wide
      nav={navProps}
    >
      <ConsentSheet />
      {wide ? (
        <div className="fsl-home flex flex-col gap-4 py-4">
          <InstallPill />
          <PushPill />
          <TripLayout
            left={wideMain !== undefined ? wideMain : groupLists}
            right={
              selection && ledgerView ? (
                <DetailsPanel view={ledgerView} selection={selection} onClose={closeDetails} />
              ) : wideMain !== undefined ? (
                <>
                  {summary}
                  {groupLists}
                </>
              ) : (
                summary
              )
            }
          />
        </div>
      ) : (
        <div className="fsl-home flex flex-col gap-4 py-4">
          <InstallPill />
          <PushPill />
          {summary}
          <TripTabs activeTab={activeTab} onChange={setActiveTab} />
          {ledgerLoading || ledgerViewLoading ? (
            <SkeletonList rows={3} />
          ) : ledgerView ? (
            activeTab === 'expenses' ? (
              <ExpenseList
                view={ledgerView}
                onOpen={handleOpenExpense}
                onOpenIncome={handleOpenIncome}
                hintable={true}
              />
            ) : (
              <PaymentsList
                view={ledgerView}
                onOpen={handleOpenPayment}
                hintable={true}
              />
            )
          ) : null}
        </div>
      )}
    </Screen>
  );
}
