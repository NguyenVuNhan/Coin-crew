import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { formatVnd, parseVnd, type Approval, type TripView } from '@fsl/core';
import { useT } from '../i18n';
import { apiSend, ApiClientError } from '../api/client';
import { nameOf, splitText } from '../lib/tripText';
import { Button } from './Button';
import { Pill } from './Pill';
import { Amount } from './Amount';
import { InlineError } from './InlineError';
import './ApprovalsCard.css';

/** POST an approval action for one row, keeping that row's own busy/error state. */
function useRowAction(tripId: string) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function run(path: string, body: unknown = {}) {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/trips/${tripId}${path}`, 'POST', body, tripId);
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function Row({ text, children, actions, error }: { text: string; children?: ReactNode; actions: ReactNode; error?: ReactNode }) {
  return (
    <li className="fsl-approvals__row">
      <p className="fsl-approvals__text">{text}</p>
      {children}
      <div className="fsl-approvals__actions">{actions}</div>
      {error}
    </li>
  );
}

function ExpenseApproval({ view, expenseId }: { view: TripView; expenseId: string }) {
  const t = useT();
  const tripId = view.trip.id;
  const { busy, error, run } = useRowAction(tripId);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const e = view.expenses.find((x) => x.id === expenseId);
  if (!e) return null;

  const payer = e.payerId === view.me.participantId ? t('expense.youPaid') : t('expense.personPaid', { name: nameOf(view, e.payerId) });
  const pendingId = [e.payerId, ...e.shares.map((s) => s.participantId)].find(
    (id) => view.people.find((p) => p.id === id)?.status === 'pending',
  );
  const errorNode =
    error instanceof ApiClientError && error.code === 'PERSON_PENDING' && pendingId ? (
      <p className="fsl-approvals__error" role="alert">{t('approvals.approveNameFirst', { name: nameOf(view, pendingId) })}</p>
    ) : error ? (
      <InlineError error={error} />
    ) : null;

  return (
    <Row
      text={t('approvals.expense', { name: nameOf(view, e.createdById), description: e.description })}
      actions={
        <>
          <Button loading={busy} onClick={() => run(`/expenses/${e.id}/approve`)}>{t('approvals.approve')}</Button>
          <Link className="fsl-button fsl-button--secondary" to={`/t/${tripId}/expenses/${e.id}/edit`}>{t('approvals.edit')}</Link>
          <Button variant="ghost" onClick={() => setRejecting((v) => !v)} aria-expanded={rejecting}>{t('approvals.reject')}</Button>
        </>
      }
      error={errorNode}
    >
      <p className="fsl-approvals__sub">
        {payer} · {splitText(e, t)} · <Amount value={e.amount} />
      </p>
      {rejecting && (
        <div className="fsl-approvals__reject">
          <label htmlFor={reasonId}>{t('approvals.rejectReason')}</label>
          <input id={reasonId} className="fsl-approvals__input" value={reason} maxLength={140} onChange={(ev) => setReason(ev.target.value)} />
          <Button variant="danger" disabled={!reason.trim()} loading={busy} onClick={() => run(`/expenses/${e.id}/reject`, { reason: reason.trim() })}>
            {t('approvals.reject')}
          </Button>
        </div>
      )}
    </Row>
  );
}

function NameApproval({ view, a }: { view: TripView; a: Extract<Approval, { kind: 'name' }> }) {
  const t = useT();
  const { busy, error, run } = useRowAction(view.trip.id);
  const match = a.matches[0];
  const path = `/people/${a.participantId}/approve`;
  return (
    <Row
      text={t('approvals.name', { name: nameOf(view, a.participantId) })}
      actions={
        <>
          {match && <Button loading={busy} onClick={() => run(path, { sameAs: match.id })}>{t('approvals.sameAs', { name: match.name })}</Button>}
          <Button variant={match ? 'secondary' : 'primary'} loading={busy} onClick={() => run(path, {})}>{t('approvals.newPerson')}</Button>
        </>
      }
      error={error ? <InlineError error={error} /> : null}
    >
      {match && <p className="fsl-approvals__sub">{t('approvals.looksLike', { name: match.name })}</p>}
    </Row>
  );
}

function BankApproval({ view, a }: { view: TripView; a: Extract<Approval, { kind: 'bank' }> }) {
  const t = useT();
  const { busy, error, run } = useRowAction(view.trip.id);
  return (
    <Row
      text={t('approvals.bank', { name: nameOf(view, a.participantId) })}
      actions={
        <>
          <Button loading={busy} onClick={() => run(`/bank/${a.bankId}/approve`)}>{t('approvals.approve')}</Button>
          <Button variant="ghost" loading={busy} onClick={() => run(`/bank/${a.bankId}/reject`)}>{t('approvals.reject')}</Button>
        </>
      }
      error={error ? <InlineError error={error} /> : null}
    >
      <div className="fsl-approvals__bank">
        <span>{a.bankName}</span>
        <span className="fsl-approvals__mono">{a.accountNumber}</span>
        <span>{a.holderName}</span>
      </div>
    </Row>
  );
}

function PaymentApproval({ view, paymentId }: { view: TripView; paymentId: string }) {
  const t = useT();
  const { busy, error, run } = useRowAction(view.trip.id);
  const p = view.payments.find((x) => x.id === paymentId);
  const [received, setReceived] = useState(p ? formatVnd(p.amountClaimed).replace(/₫$/, '') : '');
  const inputId = useId();
  if (!p) return null;
  const parsed = parseVnd(received);
  return (
    <Row
      text={t('approvals.saysPaid', { name: nameOf(view, p.fromId) })}
      actions={
        <>
          <Button
            loading={busy}
            disabled={parsed === null}
            onClick={() => run(`/payments/${p.id}/confirm`, parsed !== null && parsed !== p.amountClaimed ? { amount: parsed } : {})}
          >
            {t('approvals.confirm')}
          </Button>
          <Button variant="ghost" loading={busy} onClick={() => run(`/payments/${p.id}/not-arrived`)}>{t('approvals.didntArrive')}</Button>
        </>
      }
      error={error ? <InlineError error={error} /> : null}
    >
      <p className="fsl-approvals__sub"><Amount value={p.amountClaimed} /></p>
      <div className="fsl-approvals__received">
        <label htmlFor={inputId}>{t('approvals.amountReceived')}</label>
        <input id={inputId} className="fsl-approvals__input" inputMode="decimal" value={received} onChange={(ev) => setReceived(ev.target.value)} />
      </div>
    </Row>
  );
}

function NotArrivedApproval({ view, paymentId }: { view: TripView; paymentId: string }) {
  const t = useT();
  const { busy, error, run } = useRowAction(view.trip.id);
  const p = view.payments.find((x) => x.id === paymentId);
  if (!p) return null;
  return (
    <Row
      text={t('approvals.notArrived', { name: nameOf(view, p.toId), amount: formatVnd(p.amountConfirmed ?? p.amountClaimed), payer: nameOf(view, p.fromId) })}
      actions={
        <>
          <Button variant="danger" loading={busy} onClick={() => run(`/payments/${p.id}/disable`)}>{t('approvals.disable')}</Button>
          <Button variant="secondary" loading={busy} onClick={() => run(`/payments/${p.id}/keep`)}>{t('approvals.keep')}</Button>
        </>
      }
      error={error ? <InlineError error={error} /> : null}
    />
  );
}

function MembershipApproval({ view, a }: { view: TripView; a: Extract<Approval, { kind: 'membership' }> }) {
  const t = useT();
  const { busy, error, run } = useRowAction(view.trip.id);
  return (
    <Row
      text={t('approvals.membership', { user: a.userName, email: a.userEmail, name: nameOf(view, a.participantId) })}
      actions={
        <>
          <Button loading={busy} onClick={() => run(`/membership/${a.requestId}/approve`)}>{t('approvals.approve')}</Button>
          <Button variant="ghost" loading={busy} onClick={() => run(`/membership/${a.requestId}/reject`)}>{t('approvals.reject')}</Button>
        </>
      }
      error={error ? <InlineError error={error} /> : null}
    />
  );
}

function approvalKey(a: Approval): string {
  switch (a.kind) {
    case 'expense': return `e-${a.expenseId}`;
    case 'name': return `n-${a.participantId}`;
    case 'bank': return `b-${a.bankId}`;
    case 'payment': return `p-${a.paymentId}`;
    case 'not_arrived': return `x-${a.paymentId}`;
    case 'membership': return `m-${a.requestId}`;
  }
}

/** The amber "Needs approval" card on the member trip page; nothing when there is nothing to approve or the trip is archived. */
export function ApprovalsCard({ view }: { view: TripView }) {
  const t = useT();
  const headingId = useId();
  if (view.approvals.length === 0 || view.trip.archived) return null;
  return (
    <section className="fsl-approvals" aria-labelledby={headingId}>
      <div className="fsl-approvals__header">
        <h2 id={headingId} className="fsl-approvals__title">{t('approvals.title')}</h2>
        <Pill tone="warning">{t('approvals.fromGuest')}</Pill>
      </div>
      <ul className="fsl-approvals__list">
        {view.approvals.map((a) => {
          const key = approvalKey(a);
          switch (a.kind) {
            case 'expense': return <ExpenseApproval key={key} view={view} expenseId={a.expenseId} />;
            case 'name': return <NameApproval key={key} view={view} a={a} />;
            case 'bank': return <BankApproval key={key} view={view} a={a} />;
            case 'payment': return <PaymentApproval key={key} view={view} paymentId={a.paymentId} />;
            case 'not_arrived': return <NotArrivedApproval key={key} view={view} paymentId={a.paymentId} />;
            case 'membership': return <MembershipApproval key={key} view={view} a={a} />;
          }
        })}
      </ul>
    </section>
  );
}
