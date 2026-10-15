import { useId, useState, type JSX } from 'react';
import { formatVnd, parseVnd, type Approval, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { ApiClientError } from '../api/client';
import { nameOf, splitText } from '../lib/tripText';
import { useTripAction } from '../lib/useTripAction';
import { useOpenDetails } from '../lib/detailsNav';
import { Button } from './Button';
import { InlineError } from './InlineError';
import './ApprovalsCard.css';

function ExpenseApproval({ view, expenseId, switching }: { view: TripView; expenseId: string; switching?: boolean }) {
  const t = useT();
  const { busy, error, run } = useTripAction(view.trip.id);
  const openDetails = useOpenDetails(view.trip.id);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const e = view.expenses.find((x) => x.id === expenseId);
  if (!e) return null;

  const pendingId = [e.payerId, ...e.shares.map((s) => s.participantId)].find(
    (id) => view.people.find((p) => p.id === id)?.status === 'pending',
  );
  const errorNode =
    error instanceof ApiClientError && error.code === 'PERSON_PENDING' && pendingId ? (
      <p className="fsl-approval__error" role="alert">
        {t('approvals.approveNameFirst', { name: nameOf(view, pendingId) })}
      </p>
    ) : error ? (
      <InlineError error={error} />
    ) : null;

  return (
    <div className="fsl-approval">
      <button
        type="button"
        className="fsl-approval__content"
        onClick={() => openDetails('expense', e.id, switching)}
      >
        <span className="fsl-approval__title">{e.description}</span>
        <span className="fsl-approval__sub">
          {t('approvals.addedBy', {
            name: nameOf(view, e.createdById),
            amount: formatVnd(e.amount),
            split: splitText(e, t),
          })}
        </span>
      </button>
      {rejecting && (
        <div className="fsl-approval__form">
          <label htmlFor={reasonId}>{t('approvals.rejectReason')}</label>
          <input
            id={reasonId}
            className="fsl-approval__input"
            value={reason}
            maxLength={140}
            onChange={(ev) => setReason(ev.target.value)}
          />
          <Button
            variant="danger"
            disabled={!reason.trim()}
            loading={busy}
            onClick={() => run(`/expenses/${e.id}/reject`, { reason: reason.trim() })}
          >
            {t('approvals.reject')}
          </Button>
        </div>
      )}
      <div className="fsl-approval__actions">
        <Button loading={busy} onClick={() => run(`/expenses/${e.id}/approve`)}>
          {t('approvals.approve')}
        </Button>
        <Button variant="ghost" onClick={() => setRejecting((v) => !v)} aria-expanded={rejecting}>
          {t('approvals.reject')}
        </Button>
      </div>
      {errorNode}
    </div>
  );
}

function NameApproval({ view, a }: { view: TripView; a: Extract<Approval, { kind: 'name' }> }) {
  const t = useT();
  const { busy, error, run } = useTripAction(view.trip.id);
  const match = a.matches[0];
  const path = `/people/${a.participantId}/approve`;

  return (
    <div className="fsl-approval">
      <div className="fsl-approval__content">
        <p className="fsl-approval__title">{t('approvals.name', { name: nameOf(view, a.participantId) })}</p>
        {match && <p className="fsl-approval__sub">{t('approvals.looksLike', { name: match.name })}</p>}
      </div>
      <div className="fsl-approval__actions">
        {match && (
          <Button loading={busy} onClick={() => run(path, { sameAs: match.id })}>
            {t('approvals.sameAs', { name: match.name })}
          </Button>
        )}
        <Button variant={match ? 'secondary' : 'primary'} loading={busy} onClick={() => run(path, {})}>
          {t('approvals.newPerson')}
        </Button>
      </div>
      {error ? <InlineError error={error} /> : null}
    </div>
  );
}

function BankApproval({ view, a }: { view: TripView; a: Extract<Approval, { kind: 'bank' }> }) {
  const t = useT();
  const { busy, error, run } = useTripAction(view.trip.id);

  return (
    <div className="fsl-approval">
      <div className="fsl-approval__content">
        <p className="fsl-approval__title">{t('approvals.bank', { name: nameOf(view, a.participantId) })}</p>
        <div className="fsl-approval__sub fsl-approval__bank">
          <span>{a.bankName}</span>
          <span className="fsl-approval__mono">{a.accountNumber}</span>
          <span>{a.holderName}</span>
        </div>
      </div>
      <div className="fsl-approval__actions">
        <Button loading={busy} onClick={() => run(`/bank/${a.bankId}/approve`)}>
          {t('approvals.approve')}
        </Button>
        <Button variant="ghost" loading={busy} onClick={() => run(`/bank/${a.bankId}/reject`)}>
          {t('approvals.reject')}
        </Button>
      </div>
      {error ? <InlineError error={error} /> : null}
    </div>
  );
}

function PaymentApproval({
  view,
  paymentId,
  switching,
}: {
  view: TripView;
  paymentId: string;
  switching?: boolean;
}) {
  const t = useT();
  const { busy, error, run } = useTripAction(view.trip.id);
  const openDetails = useOpenDetails(view.trip.id);
  const [showAmount, setShowAmount] = useState(false);
  const inputId = useId();
  const p = view.payments.find((x) => x.id === paymentId);
  const [received, setReceived] = useState(p ? formatVnd(p.amountClaimed).replace(/₫$/, '') : '');
  if (!p) return null;
  const parsed = parseVnd(received);
  const amount = showAmount ? parsed : p.amountClaimed;

  return (
    <div className="fsl-approval">
      <button
        type="button"
        className="fsl-approval__content"
        onClick={() => openDetails('payment', p.id, switching)}
      >
        <span className="fsl-approval__title">
          {t('approvals.paidYou', { name: nameOf(view, p.fromId), amount: formatVnd(p.amountClaimed) })}
        </span>
        <span className="fsl-approval__sub">{t('approvals.didItArrive')}</span>
      </button>
      {showAmount && (
        <div className="fsl-approval__form">
          <label htmlFor={inputId}>{t('approvals.amountReceived')}</label>
          <input
            id={inputId}
            className="fsl-approval__input"
            inputMode="decimal"
            aria-describedby={`${inputId}-preview`}
            value={received}
            onChange={(ev) => setReceived(ev.target.value)}
          />
          <span
            id={`${inputId}-preview`}
            className={parsed === null ? 'fsl-approval__error' : 'fsl-approval__mono'}
          >
            {parsed === null ? t('expenseForm.amountInvalid') : formatVnd(parsed)}
          </span>
        </div>
      )}
      <div className="fsl-approval__actions">
        <Button
          loading={busy}
          disabled={amount === null}
          onClick={() =>
            run(
              `/payments/${p.id}/confirm`,
              amount !== null && amount !== p.amountClaimed ? { amount } : {},
            )
          }
        >
          {t('approvals.confirm')}
        </Button>
        <Button variant="ghost" loading={busy} onClick={() => run(`/payments/${p.id}/not-arrived`)}>
          {t('approvals.didntArrive')}
        </Button>
        <Button variant="ghost" onClick={() => setShowAmount((v) => !v)} aria-expanded={showAmount}>
          {t('approvals.differentAmount')}
        </Button>
      </div>
      {error ? <InlineError error={error} /> : null}
    </div>
  );
}

function NotArrivedApproval({ view, paymentId }: { view: TripView; paymentId: string }) {
  const t = useT();
  const { busy, error, run } = useTripAction(view.trip.id);
  const p = view.payments.find((x) => x.id === paymentId);
  if (!p) return null;

  return (
    <div className="fsl-approval">
      <div className="fsl-approval__content">
        <p className="fsl-approval__title">
          {t('approvals.notArrived', {
            name: nameOf(view, p.toId),
            amount: formatVnd(p.amountConfirmed ?? p.amountClaimed),
            payer: nameOf(view, p.fromId),
          })}
        </p>
      </div>
      <div className="fsl-approval__actions">
        <Button variant="danger" loading={busy} onClick={() => run(`/payments/${p.id}/disable`)}>
          {t('approvals.disable')}
        </Button>
        <Button variant="secondary" loading={busy} onClick={() => run(`/payments/${p.id}/keep`)}>
          {t('approvals.keep')}
        </Button>
      </div>
      {error ? <InlineError error={error} /> : null}
    </div>
  );
}

function MembershipApproval({ view, a }: { view: TripView; a: Extract<Approval, { kind: 'membership' }> }) {
  const t = useT();
  const { busy, error, run } = useTripAction(view.trip.id);

  return (
    <div className="fsl-approval">
      <div className="fsl-approval__content">
        <p className="fsl-approval__title">
          {t('approvals.membership', { user: a.userName, email: a.userEmail, name: nameOf(view, a.participantId) })}
        </p>
      </div>
      <div className="fsl-approval__actions">
        <Button loading={busy} onClick={() => run(`/membership/${a.requestId}/approve`)}>
          {t('approvals.approve')}
        </Button>
        <Button variant="ghost" loading={busy} onClick={() => run(`/membership/${a.requestId}/reject`)}>
          {t('approvals.reject')}
        </Button>
      </div>
      {error ? <InlineError error={error} /> : null}
    </div>
  );
}

export function approvalKey(a: Approval): string {
  switch (a.kind) {
    case 'expense':
      return `e-${a.expenseId}`;
    case 'name':
      return `n-${a.participantId}`;
    case 'bank':
      return `b-${a.bankId}`;
    case 'payment':
      return `p-${a.paymentId}`;
    case 'not_arrived':
      return `x-${a.paymentId}`;
    case 'membership':
      return `m-${a.requestId}`;
  }
}

export function waitingApprovals(view: TripView): Approval[] {
  return view.trip.archived ? [] : view.approvals;
}

export function ApprovalItem({
  view,
  approval,
  switching = false,
}: {
  view: TripView;
  approval: Approval;
  switching?: boolean;
}): JSX.Element | null {
  switch (approval.kind) {
    case 'expense':
      return <ExpenseApproval view={view} expenseId={approval.expenseId} switching={switching} />;
    case 'name':
      return <NameApproval view={view} a={approval} />;
    case 'bank':
      return <BankApproval view={view} a={approval} />;
    case 'payment':
      return <PaymentApproval view={view} paymentId={approval.paymentId} switching={switching} />;
    case 'not_arrived':
      return <NotArrivedApproval view={view} paymentId={approval.paymentId} />;
    case 'membership':
      return <MembershipApproval view={view} a={approval} />;
  }
}
