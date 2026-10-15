import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { TripView } from '@fsl/core';
import { formatVnd } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { useIsWide } from '../lib/media';
import { nameOf, splitText } from '../lib/tripText';
import { Screen } from '../components/Screen';
import { LanguageButton } from '../components/LanguageButton';
import { Amount } from '../components/Amount';
import { BalanceCard, guestPayTarget } from '../components/BalanceCard';
import { YourTransfers } from '../components/YourTransfers';
import { PaymentsList } from '../components/PaymentsList';
import { ExpenseList } from '../components/ExpenseList';
import { TripLayout } from '../components/TripLayout';
import type { Selection } from './TripRoute';
import { DetailsPanel, useDetailsSelection } from './DetailsPanel';
import './GuestTrip.css';

export function GuestTrip({ view, selection = null }: { view: TripView; selection?: Selection | null }) {
  const t = useT();
  const wide = useIsWide();
  const { detail, open } = useDetailsSelection(view.trip.id, selection);
  const hasExpenses = view.expenses.length > 0;
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

  const approvedWithMyShare = myId
    ? view.expenses.filter(
        (e) =>
          e.status === 'approved' &&
          e.shares.some((s) => s.participantId === myId),
      )
    : [];

  const totalMyShare = approvedWithMyShare.reduce((sum, e) => {
    const share = e.shares.find((s) => s.participantId === myId);
    return sum + (share ? share.amount : 0);
  }, 0);

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

  const bankPrompt =
    !archived && myBalance && myBalance.now > 0 && myPerson && myPerson.bank !== 'approved' ? (
      <div className="fsl-notice fsl-notice--accent">
        {myPerson.bank === 'pending' ? (
          t('bankForm.pending')
        ) : (
          <>
            <span>{t('bankForm.addPrompt')} </span>
            <Link to={`/t/${view.trip.id}/bank`}>
              {t('bankForm.title')}
            </Link>
          </>
        )}
      </div>
    ) : null;

  const transfers = hasExpenses || view.suggestions.length > 0 ? <YourTransfers view={view} /> : null;

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
      hintable={hintable}
      add={addLink(false)}
      addInHeading={inHeading}
    />
  );

  const share =
    approvedWithMyShare.length > 0 ? (
      <section className="fsl-guest__section">
        <h2 className="fsl-section-heading">{t('guest.yourShare')}</h2>
        <div className="fsl-card">
          {approvedWithMyShare.map((e) => {
            const myShare = e.shares.find((s) => s.participantId === myId)!;
            const subline =
              e.mode === 'equal'
                ? `${formatVnd(e.amount)} ÷ ${e.shares.length}`
                : splitText(e, t);
            return (
              <div key={e.id} className="fsl-guest__share-row">
                <div className="fsl-guest__share-info">
                  <div className="fsl-guest__share-desc">
                    {e.description}
                  </div>
                  <div className="fsl-guest__share-sub">{subline}</div>
                </div>
                <Amount value={myShare.amount} />
              </div>
            );
          })}
          <div className="fsl-guest__share-row fsl-guest__share-row--total">
            <span className="fsl-guest__share-total-label">
              {t('guest.yourTotal')}
            </span>
            <Amount
              value={totalMyShare}
              className="fsl-guest__share-total-amount"
            />
          </div>
        </div>
      </section>
    ) : null;

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
          <a
            href={`/api/auth/google/start?returnTo=${encodeURIComponent(`/t/${view.trip.id}?becomeMember=1`)}`}
            className="fsl-button fsl-button--ghost"
          >
            {t('guest.becomeMember')}
          </a>
        )
      )}
    </footer>
  );

  return (
    <Screen title={view.trip.name} wide bottomBar={!wide && hasExpenses ? addLink(true) : undefined}>
      <div className="fsl-guest">
        {banner}
        {notice}
        {!wide ? (
          <>
            {balance}
            {bankPrompt}
            {transfers}
            {payments(true)}
            {share}
            {expenses(view.payments.length === 0, false)}
          </>
        ) : (
          <TripLayout
            left={
              <>
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
                  {bankPrompt}
                  {transfers}
                  {share}
                </>
              )
            }
          />
        )}
        {footer}
      </div>
    </Screen>
  );
}
