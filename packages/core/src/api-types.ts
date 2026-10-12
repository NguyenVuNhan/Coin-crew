export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'LINK_DEAD'
  | 'VALIDATION'
  | 'ALREADY_HANDLED'
  | 'PERSON_PENDING'
  | 'TRIP_ARCHIVED'
  | 'DAILY_LIMIT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export type ActivityAction =
  | 'trip_created'
  | 'expense_added'
  | 'expense_edited'
  | 'expense_deleted'
  | 'expense_approved'
  | 'expense_rejected'
  | 'expense_disabled'
  | 'expense_enabled'
  | 'name_added'
  | 'name_approved'
  | 'name_merged'
  | 'person_removed'
  | 'bank_submitted'
  | 'bank_approved'
  | 'bank_rejected'
  | 'payment_recorded'
  | 'payment_confirmed'
  | 'payment_not_arrived'
  | 'payment_disabled'
  | 'payment_enabled'
  | 'links_regenerated'
  | 'trip_archived'
  | 'fewest_changed'
  | 'membership_requested'
  | 'membership_approved'
  | 'membership_rejected';

import type { SplitMode } from './split';
import type { Balances, ExpenseStatus, PaymentStatus } from './balances';
import type { Transfer } from './transfers';
import type { ActorKind } from './permissions';
import type { MatchReason, NameCandidate } from './names';

export interface BankFields { bin: string; accountNumber: string; holderName: string }
export interface CreateTripInput { name: string; myName: string; people: string[]; myBank?: BankFields }

export interface PersonView { id: string; name: string; status: 'active' | 'pending'; isMember: boolean; bank: 'none' | 'pending' | 'approved' }
export interface ExpenseView {
  id: string; description: string; amount: number; spentOn: string; payerId: string; mode: SplitMode;
  status: ExpenseStatus; rejectReason: string | null; disabledByName: string | null; createdById: string;
  shares: { participantId: string; amount: number; inputValue: number }[];
}
export interface PaymentView {
  id: string; fromId: string; toId: string; amountClaimed: number; amountConfirmed: number | null;
  status: PaymentStatus; notArrived: boolean; createdAt: string;
}
export type Approval =
  | { kind: 'expense'; expenseId: string }
  | { kind: 'name'; participantId: string; matches: (NameCandidate & { reason: MatchReason })[] }
  | { kind: 'bank'; bankId: string; participantId: string; bankName: string; accountNumber: string; holderName: string }
  | { kind: 'payment'; paymentId: string }
  | { kind: 'not_arrived'; paymentId: string }
  | { kind: 'membership'; requestId: string; participantId: string; userName: string; userEmail: string };
export interface TripView {
  trip: { id: string; name: string; currency: 'VND'; fewestTransfers: boolean; archived: boolean; version: number; total: number };
  me: { kind: ActorKind; participantId: string | null; participantPending: boolean; isOrganiser: boolean };
  people: PersonView[];
  balances: Balances;
  suggestions: Transfer[];
  expenses: ExpenseView[];
  payments: PaymentView[];
  myBalance: { now: number; beforePayments: number; ifPendingApproved: number | null; waitingConfirm: number } | null;
  /** Empty unless the actor is a member. */
  approvals: Approval[];
  /** Members only. */
  links: { group: string; view: string } | null;
}
export interface TripListItem { id: string; name: string; archived: boolean; myBalance: number }
export interface ActivityItem {
  id: string; action: ActivityAction; actorName: string | null; deviceShort: string | null;
  details: Record<string, unknown>; createdAt: string;
}

export interface PickerView {
  people: { id: string; name: string; status: 'active' | 'pending'; isMember: boolean; lastUsedHere: boolean; activeElsewhere: string | null }[];
  myPick: string | null;
}
