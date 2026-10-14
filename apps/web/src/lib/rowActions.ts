import {
  can,
  canConfirmPayment,
  notArrivedOutcome,
  type Actor,
  type ExpenseView,
  type PaymentView,
  type TripView,
} from '@fsl/core';
import type { RowAction } from '../components/ActionRow';
import type { useT } from '../i18n';

type T = ReturnType<typeof useT>;

export interface ActionDeps {
  t: T;
  navigate(path: string): void;
  /** POST `/api/trips/:tripId` + `path`, then refresh the trip. `body` defaults to `{}`. */
  run(path: string, body?: unknown): Promise<void>;
  /**
   * Passed only by the expense details. It opens the "why are you rejecting it?" field
   * (the API needs a reason), and it is what makes Approve and Reject appear: rows never show them.
   */
  onReject?: () => void;
}

/** The signed-in person as the permission rules in `@fsl/core` see them. */
export function actorOf(view: TripView): Actor {
  const { kind, participantId, participantPending, isOrganiser } = view.me;
  return { kind, participantId, participantPending, isOrganiser };
}

/**
 * What this person may do with an expense, in the order buttons and swipe actions show them.
 * Permissions come from `can` (the same rules the API enforces); nothing is offered in an archived trip.
 */
export function expenseActions(view: TripView, e: ExpenseView, deps: ActionDeps): RowAction[] {
  if (view.trip.archived) return [];
  const { t, navigate, run, onReject } = deps;
  const actor = actorOf(view);
  const actions: RowAction[] = [];

  if (onReject && e.status === 'pending' && can(actor, 'approve')) {
    actions.push(
      { id: 'approve', label: t('approvals.approve'), icon: 'check', tone: 'success', onSelect: () => void run(`/expenses/${e.id}/approve`) },
      { id: 'reject', label: t('approvals.reject'), icon: 'x', tone: 'danger', onSelect: onReject },
    );
  }

  if (can(actor, 'edit_expense', { expenseCreatedById: e.createdById, expenseStatus: e.status })) {
    actions.push({ id: 'edit', label: t('approvals.edit'), icon: 'edit', onSelect: () => navigate(`/t/${view.trip.id}/expenses/${e.id}/edit`) });
  }

  if (can(actor, 'disable')) {
    if (e.status === 'disabled') {
      actions.push({ id: 'enable', label: t('expenses.enable'), icon: 'circleCheck', onSelect: () => void run(`/expenses/${e.id}/enable`) });
    } else if (e.status === 'approved' || e.status === 'pending') {
      // A rejected expense has been handled already: the API turns a disable of it down.
      actions.push({ id: 'disable', label: t('expenses.disable'), icon: 'ban', tone: 'danger', onSelect: () => void run(`/expenses/${e.id}/disable`) });
    }
  }

  return actions;
}

/**
 * What this person may do with a payment: the receiving member confirms or reports one that is waiting,
 * a guest receiver reports a confirmed one, and members disable or re-enable.
 */
export function paymentActions(view: TripView, p: PaymentView, deps: ActionDeps): RowAction[] {
  if (view.trip.archived) return [];
  const { t, run } = deps;
  const actor = actorOf(view);
  const receiverIsMember = view.people.find((person) => person.id === p.toId)?.isMember ?? false;
  const actions: RowAction[] = [];

  if (canConfirmPayment(actor, p, receiverIsMember)) {
    actions.push({ id: 'confirm', label: t('approvals.confirm'), icon: 'check', tone: 'success', onSelect: () => void run(`/payments/${p.id}/confirm`) });
  }

  if (!p.notArrived && notArrivedOutcome(actor, p, receiverIsMember) !== 'forbidden') {
    actions.push({ id: 'not-arrived', label: t('approvals.didntArrive'), icon: 'x', tone: 'danger', onSelect: () => void run(`/payments/${p.id}/not-arrived`) });
  }

  if (can(actor, 'disable')) {
    if (p.status === 'disabled') {
      actions.push({ id: 'enable', label: t('payments.enable'), icon: 'circleCheck', onSelect: () => void run(`/payments/${p.id}/enable`) });
    } else if (p.status === 'confirmed' || p.status === 'says_paid') {
      actions.push({ id: 'disable', label: t('payments.disable'), icon: 'ban', tone: 'danger', onSelect: () => void run(`/payments/${p.id}/disable`) });
    }
  }

  return actions;
}
