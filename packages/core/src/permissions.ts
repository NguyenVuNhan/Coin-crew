import type { ExpenseStatus, PaymentStatus } from './balances';

export type ActorKind = 'member' | 'guest' | 'viewer';
export interface Actor { kind: ActorKind; participantId: string | null; participantPending: boolean; isOrganiser: boolean }
export type Action = 'view' | 'add_expense' | 'edit_expense' | 'delete_expense' | 'approve' | 'disable' | 'merge'
  | 'remove_person' | 'regenerate_links' | 'archive' | 'set_fewest' | 'set_own_bank' | 'record_payment' | 'view_bank';
export interface ActionContext {
  expenseCreatedById?: string; expenseStatus?: ExpenseStatus;
  paymentFromId?: string; paymentToId?: string; owesTo?: boolean;
}

const MEMBER_ONLY: ReadonlySet<Action> = new Set(['approve', 'disable', 'merge', 'remove_person', 'regenerate_links', 'set_fewest']);

// Source of truth for the permission matrix in the plan (Task 6). Every API route checks through here.
export function can(actor: Actor, action: Action, ctx: ActionContext = {}): boolean {
  const { kind, participantId: me } = actor;
  if (action === 'view') return true;
  if (kind === 'viewer') return false;
  const isMember = kind === 'member';
  const activeGuest = kind === 'guest' && !actor.participantPending;

  switch (action) {
    case 'add_expense':
      return true;
    case 'edit_expense':
    case 'delete_expense':
      // Only the person who added an expense edits or deletes it: a member any time, a guest while it is pending.
      return me !== null && ctx.expenseCreatedById === me && (isMember || ctx.expenseStatus === 'pending');
    case 'archive':
      return isMember && actor.isOrganiser;
    case 'set_own_bank':
      return isMember || activeGuest;
    case 'record_payment':
      return (isMember || activeGuest) && me !== null && (ctx.paymentFromId === me || ctx.paymentToId === me);
    case 'view_bank':
      return (isMember || activeGuest) && ctx.owesTo === true;
    default:
      return isMember && MEMBER_ONLY.has(action);
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
