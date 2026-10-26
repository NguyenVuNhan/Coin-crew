import {
  can,
  canConfirmPayment,
  notArrivedOutcome,
  arrivedOutcome,
  type Actor,
  type ExpenseView,
  type PaymentView,
  type PersonView,
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
  const { kind, participantId, participantPending, isOrganiser, isAdmin } = view.me;
  return { kind, participantId, participantPending, isOrganiser, isAdmin };
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
  const expenseInvolved =
    actor.participantId === e.payerId ||
    (e.shares ?? []).some((s) => s.participantId === actor.participantId);

  if (onReject && e.status === 'pending' && can(actor, 'approve_expense', { expenseInvolved })) {
    actions.push(
      { id: 'approve', label: t('approvals.approve'), icon: 'check', tone: 'success', onSelect: () => void run(`/expenses/${e.id}/approve`) },
      { id: 'reject', label: t('approvals.reject'), icon: 'x', tone: 'danger', onSelect: onReject },
    );
  }

  if (can(actor, 'edit_expense', { expenseCreatedById: e.createdById, expenseStatus: e.status })) {
    actions.push({ id: 'edit', label: t('approvals.edit'), icon: 'edit', onSelect: () => navigate(`/t/${view.trip.id}/expenses/${e.id}/edit`) });
  }

  if (can(actor, 'disable', { expenseInvolved })) {
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
 * a guest receiver reports a confirmed one, the receiver who reported one says it arrived after all, and members
 * disable or re-enable.
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

  if (arrivedOutcome(actor, p, receiverIsMember) !== 'forbidden') {
    actions.push({ id: 'arrived', label: t('payments.arrived'), icon: 'check', tone: 'success', onSelect: () => void run(`/payments/${p.id}/arrived`) });
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

/** A member may save or delete the bank details of an active guest (members manage their own), in a live trip. */
export function canManageBankOf(view: TripView, personId: string): boolean {
  const person = view.people.find((p) => p.id === personId);
  return !view.trip.archived && can(actorOf(view), 'manage_bank') && person !== undefined && !person.isMember && person.status === 'active';
}

export interface PersonActionDeps {
  t: T;
  onMerge(): void;
  onRemove(): void;
  onBank(): void;
  onMakeAdmin?(): void;
  onRemoveAdmin?(): void;
  onRestore?(): void;
}

/**
 * What a member may do with a person on the People screen: manage a guest's bank details, merge them into another
 * name, or remove them. Members manage their own bank details, so only guests get the bank action.
 * Admins remove anyone but the organiser and themselves (they leave from Settings instead); only the organiser
 * removes another admin. Someone who left can only be brought back. Nothing is offered in an archived trip.
 */
export function personActions(view: TripView, person: PersonView, deps: PersonActionDeps): RowAction[] {
  if (view.trip.archived) return [];
  const { t, onMerge, onRemove, onBank, onMakeAdmin, onRemoveAdmin, onRestore } = deps;
  const actor = actorOf(view);
  const actions: RowAction[] = [];

  if (person.status === 'left') {
    if (can(actor, 'restore_person') && onRestore) {
      actions.push({ id: 'restore', label: t('people.restore'), icon: 'rotateCcw', onSelect: onRestore });
    }
    return actions;
  }

  if (
    can(actor, 'promote_admin') &&
    person.isMember &&
    !person.isAdmin &&
    !person.isOrganiser &&
    person.status === 'active' &&
    onMakeAdmin
  ) {
    actions.push({
      id: 'make-admin',
      label: t('people.makeAdmin'),
      icon: 'shield',
      onSelect: onMakeAdmin,
    });
  }

  if (
    can(actor, 'demote_admin') &&
    person.isMember &&
    person.isAdmin &&
    !person.isOrganiser &&
    person.status === 'active' &&
    onRemoveAdmin
  ) {
    actions.push({
      id: 'remove-admin',
      label: t('people.removeAdmin'),
      icon: 'shield',
      tone: 'danger',
      onSelect: onRemoveAdmin,
    });
  }

  if (canManageBankOf(view, person.id)) {
    actions.push({ id: 'bank', label: t('people.bank'), icon: 'bank', onSelect: onBank });
  }

  if (can(actor, 'merge')) {
    actions.push({ id: 'merge', label: t('people.merge'), icon: 'merge', onSelect: onMerge });
  }

  if (
    can(actor, 'remove_person', { targetIsAdmin: person.isAdmin === true }) &&
    person.isOrganiser !== true &&
    person.id !== view.me.participantId
  ) {
    actions.push({ id: 'remove', label: t('people.remove'), icon: 'trash', tone: 'danger', onSelect: onRemove });
  }

  return actions;
}
