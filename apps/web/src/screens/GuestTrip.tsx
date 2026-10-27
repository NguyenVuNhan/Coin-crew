import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { TripView } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { useIsWide } from '../lib/media';
import { fundOf } from '../lib/fund';
import { nameOf } from '../lib/tripText';
import { Screen } from '../components/Screen';
import { LanguageButton } from '../components/LanguageButton';
import { BalanceCard, guestPayTarget } from '../components/BalanceCard';
import { FundPill } from '../components/FundPill';
import { TransfersSnackbar, YourTransfers, useTransfersState } from '../components/YourTransfers';
import { PaymentsList } from '../components/PaymentsList';
import { ExpenseList } from '../components/ExpenseList';
import { TripLayout } from '../components/TripLayout';
import { MyBankRow } from '../components/MyBankRow';
import type { Selection } from './TripRoute';
import { DetailsPanel, useDetailsSelection } from './DetailsPanel';
import { UpdatedTransactionsBanner } from '../components/UpdatedTransactionsBanner';
import { TripTabs } from '../components/TripTabs';
import { SignInButtons } from '../components/SignInButtons';
import './GuestTrip.css';

export function GuestTrip({ view, selection = null }: { view: TripView; selection?: Selection | null }) {
  const t = useT();
  const wide = useIsWide();
  const [activeTab, setActiveTab] = useState<'expenses' | 'payments'>('expenses');
  const { detail, open } = useDetailsSelection(view.trip.id, selection);
  // Held here, above the phone / layout A branch, so crossing 1024px keeps an open QR row and a pending tick (R-Z).
  const transfersState = useTransfersState(view);
  const hasExpenses = view.expenses.length > 0;
  // The feed is empty only with no expenses and no fund income (spec §7.4); only then does the empty state carry the add link.
  const hasFeed = hasExpenses || (fundOf(view)?.incomes.length ?? 0) > 0;
  // The API refuses every write on an archived trip, so the page offers none (no add, pay, bank prompt or membership request).
  const archived = view.trip.archived;
  const showsPay = hasExpenses && guestPayTarget(view) !== null && !(wide && detail !== null);

  const [searchParams] = useSearchParams();
  const becomeMemberParam = searchParams.get('becomeMember') === '1';
  const [memberRequested, setMemberRequested] = useState(false);
  const requestedRef = useRef(false);

  const myId = view.me.participantId;
  const myName = myId ? nameOf(view, myId) : '?';
  const myPerson = view.people.find((p) => p.id === myId);
  const myBalance = view.myBalance;

  useEffect(() => {
    if (
      becomeMemberParam &&
      !archived &&
      view.me.kind === 'guest' &&
      myId &&
      !requestedRef.current
    ) {
      requestedRef.current = true;
      setMemberRequested(true);
      apiSend(
        `/api/trips/${view.trip.id}/membership`,
        'POST',
        { participantId: myId },
        view.trip.id,
      ).catch(() => {});
    }
  }, [becomeMemberParam, archived, view.me.kind, myId, view.trip.id]);

  const addLink = (block: boolean) =>
    archived ? undefined : (
      <Link
        to={`/t/${view.trip.id}/expenses/new`}
        className={`fsl-button fsl-button--${showsPay ? 'secondary' : 'primary'}${block ? ' fsl-button--block' : ''}`}
      >
        {t('trip.addExpense')}
      </Link>
    );

  const notice = archived ? <p className="fsl-guest__notice">{t('settings.archived')}</p> : null;

  const banner = (
    <div className="fsl-guest__banner">
      <span>{t('guest.viewingAs', { name: myName })}</span>
      <span className="fsl-guest__banner-dot">·</span>
      <Link
        to={`/t/${view.trip.id}/who`}
        className="fsl-guest__switch-link"
      >
        {t('guest.switch', { name: myName })}
      </Link>
    </div>
  );

  const balance = hasExpenses ? <BalanceCard view={view} /> : null;
  const fund = <FundPill view={view} />;

  // Always there (not only when someone owes the guest), so they can add details early; archived trips get none.
  const bankRow = <MyBankRow view={view} />;

  const transfers = hasExpenses || view.suggestions.length > 0 ? <YourTransfers view={view} state={transfersState} /> : null;

  const payments = (hintable: boolean) => (
    <PaymentsList
      view={view}
      selectedId={detail?.kind === 'payment' ? detail.id : undefined}
      onOpen={(id) => open('payment', id)}
      hintable={hintable}
    />
  );

  const expenses = (hintable: boolean, inHeading: boolean) => (
    <ExpenseList
      view={view}
      selectedId={detail?.kind === 'expense' ? detail.id : undefined}
      onOpen={(id) => open('expense', id)}
      onOpenIncome={(id) => open('income', id)}
      hintable={hintable}
      add={addLink(false)}
      addInHeading={inHeading}
    />
  );

  const footer = (
    <footer className="fsl-guest__footer">
      <LanguageButton />
      {memberRequested ? (
        <div className="fsl-notice fsl-notice--accent">
          {t('guest.memberRequested')}
        </div>
      ) : (
        view.me.kind === 'guest' &&
        !archived && (
          <SignInButtons
            layout="inline"
            returnTo={`/t/${view.trip.id}?becomeMember=1`}
            labels={{ google: 'guest.becomeMember', zalo: 'guest.becomeMemberZalo' }}
          />
        )
      )}
    </footer>
  );

  return (
    <Screen title={view.trip.name} wide bottomBar={!wide && hasFeed ? addLink(true) : undefined}>
      <div className="fsl-guest">
        {banner}
        {notice}
        <UpdatedTransactionsBanner view={view} />
        {!wide ? (
          <>
            {balance}
            {fund}
            {bankRow}
            {transfers}
            <TripTabs activeTab={activeTab} onChange={setActiveTab} />
            {activeTab === 'expenses' ? expenses(true, false) : payments(true)}
          </>
        ) : (
          <TripLayout
            left={
              <>
                {fund}
                {expenses(true, true)}
                {payments(false)}
              </>
            }
            right={
              selection ? (
                <DetailsPanel view={view} selection={selection} />
              ) : (
                <>
                  {balance}
                  {bankRow}
                  {transfers}
                </>
              )
            }
          />
        )}
        {footer}
        <TransfersSnackbar view={view} state={transfersState} />
      </div>
    </Screen>
  );
}
