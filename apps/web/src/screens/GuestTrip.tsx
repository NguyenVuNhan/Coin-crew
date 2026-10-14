import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { TripView } from '@fsl/core';
import { formatVnd } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend } from '../api/client';
import { nameOf, splitText } from '../lib/tripText';
import { Screen } from '../components/Screen';
import { LanguageButton } from '../components/LanguageButton';
import { Amount } from '../components/Amount';
import { EmptyState } from '../components/EmptyState';
import { ExpenseRow } from '../components/ExpenseRow';
import { PaymentsList } from '../components/PaymentsList';
import { ReceivedButton } from '../components/ReceivedButton';
import './GuestTrip.css';

export function GuestTrip({ view }: { view: TripView }) {
  const t = useT();
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
  }, [becomeMemberParam, view.me.kind, myId, view.trip.id]);

  const mySuggestions = myId
    ? view.suggestions.filter((s) => s.fromId === myId)
    : [];

  const waitingPayments = myId
    ? view.payments.filter((p) => p.status === 'says_paid' && p.fromId === myId)
    : [];

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

  return (
    <Screen title={view.trip.name} right={<LanguageButton />}>
      <div className="fsl-guest">
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

        {myBalance && (
          <div className="fsl-guest__hero">
            {myBalance.now < 0 ? (
              mySuggestions.length > 0 ? (
                mySuggestions.map((suggestion) => (
                  <div
                    key={suggestion.toId}
                    className="fsl-guest__hero-owe-block"
                  >
                    <div className="fsl-guest__hero-label">
                      {t('guest.youOwe', {
                        name: nameOf(view, suggestion.toId),
                      })}
                    </div>
                    <Amount
                      value={Math.abs(suggestion.amount)}
                      tone="danger"
                      size="xl"
                    />
                    <Link
                      to={`/t/${view.trip.id}/pay/${suggestion.toId}`}
                      className="fsl-button fsl-button--primary fsl-button--block"
                    >
                      {t('pay.payWithVietQr')}
                    </Link>
                  </div>
                ))
              ) : (
                <div className="fsl-guest__hero-owe-block">
                  <div className="fsl-guest__hero-label">
                    {t('trips.youOwe')}
                  </div>
                  <Amount
                    value={Math.abs(myBalance.now)}
                    tone="danger"
                    size="xl"
                  />
                </div>
              )
            ) : myBalance.now > 0 ? (
              <div className="fsl-guest__hero-owed-block">
                <div className="fsl-guest__hero-label">
                  {t('guest.youreOwed')}
                </div>
                <Amount value={myBalance.now} tone="success" size="xl" />
              </div>
            ) : (
              <div className="fsl-guest__hero-settled">
                {t('guest.settled')}
              </div>
            )}

            {myBalance.ifPendingApproved !== null && (
              <div className="fsl-guest__hero-sub">
                {t('guest.dropsTo', {
                  amount: formatVnd(Math.abs(myBalance.ifPendingApproved)),
                })}
              </div>
            )}

            {waitingPayments.map((p) => (
              <div key={p.id} className="fsl-guest__hero-sub">
                {t('trip.waitingConfirm', {
                  amount: formatVnd(p.amountClaimed),
                  name: nameOf(view, p.toId),
                })}
              </div>
            ))}
          </div>
        )}

        {myBalance && myBalance.now > 0 && myPerson && myPerson.bank !== 'approved' && (
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
        )}

        {myId && view.suggestions.some((s) => s.toId === myId) && (
          <section className="fsl-guest__section" aria-label={t('guest.paysYou')}>
            <h2 className="fsl-section-heading">{t('guest.paysYou')}</h2>
            <ul className="fsl-guest__pays-you">
              {view.suggestions.filter((s) => s.toId === myId).map((s) => (
                <li key={s.fromId} className="fsl-guest__pays-you-row">
                  <span className="fsl-guest__pays-you-name">{nameOf(view, s.fromId)}</span>
                  <Amount value={s.amount} tone="success" />
                  <ReceivedButton view={view} fromId={s.fromId} amount={s.amount} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <PaymentsList view={view} mode="guest" />

        <div className="fsl-guest__action">
          <Link
            to={`/t/${view.trip.id}/expenses/new`}
            className="fsl-button fsl-button--primary fsl-button--block"
          >
            {t('trip.addExpense')}
          </Link>
        </div>

        {approvedWithMyShare.length > 0 && (
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
        )}

        <section className="fsl-guest__section">
          <h2 className="fsl-section-heading">{t('trip.expenses')}</h2>
          {view.expenses.length === 0 ? (
            <EmptyState
              title={t('expenses.empty')}
              action={
                <Link
                  to={`/t/${view.trip.id}/expenses/new`}
                  className="fsl-button fsl-button--primary"
                >
                  {t('trip.addExpense')}
                </Link>
              }
            />
          ) : (
            <div className="fsl-card">
              {view.expenses.map((expense) => {
                const isMyPending =
                  expense.status === 'pending' &&
                  myId !== null &&
                  (expense.createdById === myId || expense.payerId === myId);
                const href = isMyPending
                  ? `/t/${view.trip.id}/expenses/${expense.id}/edit`
                  : undefined;

                return (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    view={view}
                    href={href}
                  />
                );
              })}
            </div>
          )}
        </section>

        <footer className="fsl-guest__footer">
          {memberRequested ? (
            <div className="fsl-notice fsl-notice--accent">
              {t('guest.memberRequested')}
            </div>
          ) : (
            view.me.kind === 'guest' && (
              <a
                href={`/api/auth/google/start?returnTo=${encodeURIComponent(`/t/${view.trip.id}?becomeMember=1`)}`}
                className="fsl-button fsl-button--ghost fsl-button--block"
              >
                {t('guest.becomeMember')}
              </a>
            )
          )}
        </footer>
      </div>
    </Screen>
  );
}
