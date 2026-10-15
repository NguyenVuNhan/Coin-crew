import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { TripView } from '@fsl/core';
import { useT } from '../i18n';
import { useIsWide } from '../lib/media';
import { useBackToTrip, useOpenDetails } from '../lib/detailsNav';
import { Screen } from '../components/Screen';
import { Icon } from '../components/icons';
import { ApprovalQueue } from '../components/ApprovalQueue';
import { BalanceCard } from '../components/BalanceCard';
import { InviteCard, InviteSheet } from '../components/InviteSheet';
import { YourTransfers } from '../components/YourTransfers';
import { PaymentsList } from '../components/PaymentsList';
import { ExpenseList } from '../components/ExpenseList';
import { TripLayout } from '../components/TripLayout';
import { ExpenseDetails } from '../components/ExpenseDetails';
import { PaymentDetails } from '../components/PaymentDetails';
import type { Selection } from './TripRoute';
import { ApprovalList } from './Approvals';
import './MemberTrip.css';

type Detail = Exclude<Selection, { kind: 'approvals' }>;

/**
 * The wide screen's right panel showing one expense or payment, or the full approvals list. Not modal: it takes
 * focus when it opens, × and Esc close it (back in history, or to the trip for a shared link), and nothing else is trapped.
 */
function DetailsPanel({ view, selection }: { view: TripView; selection: Selection }) {
  const t = useT();
  const close = useBackToTrip(view.trip.id);
  const panel = useRef<HTMLElement>(null);
  const label = selection.kind === 'expense' ? t('details.expense') : selection.kind === 'payment' ? t('details.payment') : t('approvals.allTitle');
  const selectedId = selection.kind === 'approvals' ? null : selection.id;

  useEffect(() => {
    const el = panel.current;
    (el?.querySelector<HTMLElement>('h2') ?? el)?.focus();
  }, [selection.kind, selectedId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // A sheet open on top (Invite) handles its own Esc.
      if (e.target instanceof Element && e.target.closest('[role="dialog"]')) return;
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

  return (
    <section
      ref={panel}
      tabIndex={-1}
      className="fsl-member__panel"
      aria-label={label}
    >
      <div className="fsl-member__panel-head">
        <span className="fsl-member__panel-kind">{label}</span>
        <button type="button" className="fsl-member__panel-close" aria-label={t('common.close')} title={t('common.close')} onClick={close}>
          <Icon name="x" size={20} />
        </button>
      </div>
      {/* Keyed by id so a reject reason or an error never carries over to the next row. */}
      {selection.kind === 'expense' ? (
        <ExpenseDetails key={selection.id} view={view} expenseId={selection.id} onClose={close} />
      ) : selection.kind === 'payment' ? (
        <PaymentDetails key={selection.id} view={view} paymentId={selection.id} onClose={close} />
      ) : (
        <ApprovalList view={view} onClose={close} switching />
      )}
    </section>
  );
}

/** The trip page for signed-in members (spec §5.1): phone order below 1024px, layout A from there. */
export function MemberTrip({ view, selection = null }: { view: TripView; selection?: Selection | null }) {
  const t = useT();
  const wide = useIsWide();
  const openDetails = useOpenDetails(view.trip.id);
  const [inviteOpen, setInviteOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const tripId = view.trip.id;
  const archived = view.trip.archived;
  const hasExpenses = view.expenses.length > 0;
  const canInvite = !archived && view.links !== null;
  const detail: Detail | null = selection && selection.kind !== 'approvals' ? selection : null;
  const detailKey = detail ? `${detail.kind}/${detail.id}` : null;

  function open(kind: Detail['kind'], id: string) {
    if (detail?.kind === kind && detail.id === id) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The wide panel shows one thing at a time (details or the approvals list): switching replaces the entry, so × is one step from the list.
    openDetails(kind, id, selection !== null);
  }

  // When the panel closes, focus goes back to the row that opened it.
  const lastDetail = useRef(detailKey);
  useEffect(() => {
    if (lastDetail.current !== null && detailKey === null && opener.current?.isConnected) opener.current.focus();
    lastDetail.current = detailKey;
  }, [detailKey]);

  const addLink = (block: boolean, variant: 'primary' | 'secondary' = 'primary') =>
    archived ? undefined : (
      <Link className={`fsl-button fsl-button--${variant}${block ? ' fsl-button--block' : ''}`} to={`/t/${tripId}/expenses/new`}>
        {t('trip.addExpense')}
      </Link>
    );

  const notice = archived ? <p className="fsl-member__notice">{t('settings.archived')}</p> : null;
  // A brand-new trip leads with the invite card; the balance appears with the first expense.
  const balance = hasExpenses ? <BalanceCard view={view} /> : canInvite ? <InviteCard view={view} /> : null;
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
      // On a new trip the invite card's Share is the one primary button, so the empty state's add steps back.
      add={addLink(false, !hasExpenses && canInvite ? 'secondary' : 'primary')}
      addInHeading={inHeading}
    />
  );

  const header = (
    <>
      {canInvite && (
        <button type="button" className="fsl-member__invite" onClick={() => setInviteOpen(true)}>
          <Icon name="userPlus" size={20} />
          <span>{t('invite.button')}</span>
        </button>
      )}
      <Link className="fsl-member__settings" to={`/t/${tripId}/settings`} aria-label={t('member.settings')} title={t('member.settings')}>
        <Icon name="settings" size={20} />
      </Link>
    </>
  );

  return (
    <Screen
      title={view.trip.name}
      back="/trips"
      right={header}
      wide
      // R-D: no bottom bar on an empty trip, the empty state carries the only "+ Add expense". From 1024px it sits in the Expenses heading.
      bottomBar={!wide && hasExpenses ? addLink(true) : undefined}
    >
      {wide ? (
        <div className="fsl-member">
          <TripLayout
            left={
              <>
                {notice}
                <ApprovalQueue view={view} switching={selection !== null} />
                {expenses(true, true)}
                {payments(false)}
              </>
            }
            right={selection ? <DetailsPanel view={view} selection={selection} /> : <>{balance}{transfers}</>}
          />
        </div>
      ) : (
        <div className="fsl-member">
          {notice}
          <ApprovalQueue view={view} />
          {balance}
          {transfers}
          {/* Only the first swipeable list on the page shows the swipe hint. */}
          {payments(true)}
          {expenses(view.payments.length === 0, false)}
        </div>
      )}
      {canInvite && <InviteSheet view={view} open={inviteOpen} onClose={() => setInviteOpen(false)} />}
    </Screen>
  );
}
