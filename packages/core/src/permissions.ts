import type { ExpenseStatus, PaymentStatus } from './balances';

export type ActorKind = 'member' | 'guest' | 'viewer';
export interface Actor { kind: ActorKind; participantId: string | null; participantPending: boolean; isOrganiser: boolean; isAdmin?: boolean }
export type Action = 'view' | 'add_expense' | 'edit_expense' | 'delete_expense' | 'approve' | 'disable' | 'merge'
  | 'remove_person' | 'regenerate_links' | 'archive' | 'unarchive' | 'set_fewest' | 'set_own_bank' | 'record_payment' | 'view_bank' | 'manage_bank'
  | 'approve_expense' | 'add_person' | 'promote_admin' | 'demote_admin';
export interface ActionContext {
  expenseCreatedById?: string; expenseStatus?: ExpenseStatus;
  paymentFromId?: string; paymentToId?: string; owesTo?: boolean;
  /** The actor already has approved bank details in this trip. */
  bankApproved?: boolean;
  isExpensePayer?: boolean;
  expenseInvolved?: boolean;
}

// Source of truth for the permission matrix in the plan (Task 6). Every API route checks through here.
export function can(actor: Actor, action: Action, ctx: ActionContext = {}): boolean {
  const { kind, participantId: me } = actor;
  if (action === 'view') return true;
  if (kind === 'viewer') return false;
  const isMember = kind === 'member';
  const activeGuest = kind === 'guest' && !actor.participantPending;
  const isAdmin = Boolean(actor.isAdmin) || actor.isOrganiser;

  switch (action) {
    case 'add_expense':
      return true;
    case 'edit_expense':
    case 'delete_expense':
      // Only the person who added an expense edits or deletes it: a member any time, a guest while it is pending.
      return me !== null && ctx.expenseCreatedById === me && (isMember || ctx.expenseStatus === 'pending');
    case 'archive':
    case 'unarchive':
    case 'demote_admin':
      return isMember && actor.isOrganiser;
    case 'set_own_bank':
      // Once a member approves a guest's details, only a member changes them (manage_bank).
      return isMember || (activeGuest && ctx.bankApproved !== true);
    case 'record_payment':
      return (isMember || activeGuest) && me !== null && (ctx.paymentFromId === me || ctx.paymentToId === me);
    case 'view_bank':
      return (isMember || activeGuest) && (ctx.owesTo === true || ctx.isExpensePayer === true);
    case 'approve_expense':
      return isMember && (isAdmin || ctx.expenseInvolved === true);
    case 'disable':
      return isMember && (isAdmin || ctx.expenseInvolved === true);
    case 'approve':
    case 'manage_bank':
    case 'merge':
    case 'remove_person':
    case 'regenerate_links':
    case 'set_fewest':
    case 'add_person':
    case 'promote_admin':
      return isMember && isAdmin;
    default:
      return false;
  }
}

export function initialExpenseStatus(actor: Actor): 'approved' | 'pending' {
  return actor.kind === 'member' ? 'approved' : 'pending';
}

// A guest's payment into a member's account only counts once that member records or confirms it; a member's own record counts straight away (spec §9.4).
export function statusForNewPayment(a: { actorId: string; fromId: string; toId: string; receiverIsMember: boolean; payerIsMember: boolean }): 'says_paid' | 'confirmed' | 'forbidden' {
  if (a.actorId !== a.fromId && a.actorId !== a.toId) return 'forbidden';
  return a.receiverIsMember && a.actorId !== a.toId && !a.payerIsMember ? 'says_paid' : 'confirmed';
}

export function canConfirmPayment(actor: Actor, p: { toId: string; status: PaymentStatus }, receiverIsMember: boolean): boolean {
  return actor.kind === 'member' && receiverIsMember && actor.participantId === p.toId && p.status === 'says_paid';
}

export type NotArrivedOutcome = 'reject' | 'flag' | 'forbidden';

export function notArrivedOutcome(actor: Actor, p: { toId: string; status: PaymentStatus }, receiverIsMember: boolean): NotArrivedOutcome {
  if (actor.participantId === null || actor.participantId !== p.toId) return 'forbidden';
  if (receiverIsMember && actor.kind === 'member' && p.status === 'says_paid') return 'reject';
  if (!receiverIsMember && actor.kind === 'guest' && p.status === 'confirmed') return 'flag';
  return 'forbidden';
}

export type ArrivedOutcome = 'confirm' | 'clear' | 'forbidden';

/**
 * Undoing a "didn't arrive": only the receiver who reported it. A member's report rejected a waiting payment, so
 * saying it arrived counts it; a guest's report flagged a confirmed one, so saying it arrived clears the flag.
 */
export function arrivedOutcome(actor: Actor, p: { toId: string; status: PaymentStatus; notArrived: boolean }, receiverIsMember: boolean): ArrivedOutcome {
  if (actor.participantId === null || actor.participantId !== p.toId) return 'forbidden';
  if (receiverIsMember && actor.kind === 'member' && p.status === 'rejected') return 'confirm';
  if (!receiverIsMember && actor.kind === 'guest' && p.status === 'confirmed' && p.notArrived) return 'clear';
  return 'forbidden';
}
