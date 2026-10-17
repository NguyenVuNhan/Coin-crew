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
  | 'bank_set'
  | 'bank_removed'
  | 'payment_recorded'
  | 'payment_confirmed'
  | 'payment_not_arrived'
  | 'payment_arrived'
  | 'payment_disabled'
  | 'payment_enabled'
  | 'links_regenerated'
  | 'trip_archived'
  | 'fewest_changed'
  | 'membership_requested'
  | 'membership_approved'
  | 'membership_rejected'
  | 'admin_promoted'
  | 'admin_demoted'
  | 'expense_rolled_back';

import type { Gender, SplitEntry, SplitMode, SportParticipantEntry, SportRule } from './split';
import type { Balances, ExpenseStatus, PaymentStatus } from './balances';
import type { Transfer } from './transfers';
import type { ActorKind } from './permissions';
import type { MatchReason, NameCandidate } from './names';

export interface MeUserView {
  id: string;
  email: string;
  name: string;
  gender?: Gender | null;
  avatarUrl?: string | null;
  consentAt: string | null;
}

export interface UpdateProfileInput {
  name?: string;
  gender?: Gender | null;
  avatarUrl?: string | null;
}

export interface ExpenseHistoryItem {
  id: string;
  description: string;
  amount: number;
  spentOn: string;
  payerId: string;
  mode: SplitMode;
  createdById: string;
  createdAt: string;
  shares: { participantId: string; amount: number; inputValue: number }[];
  meta?: ExpenseMeta | null;
}

export type GroupPreset = 'trip' | 'sport';

export interface BankFields { bin: string; accountNumber: string; holderName: string }
/** A person to add when creating a trip: a plain name, or someone with an account from the recent-people list. */
export type CreateTripPerson = { name: string; userId?: string; gender?: Gender | null };
/** Plain strings are still accepted so an older open client keeps working. */
export interface CreateTripInput {
  name: string;
  myName: string;
  myGender?: Gender | null;
  preset?: GroupPreset;
  people: (string | CreateTripPerson)[];
  myBank?: BankFields;
  defaultLang?: 'en' | 'vi';
}
/** Someone with an account who shared a trip with the caller (`GET /api/me/people`). */
export interface RecentPerson {
  userId: string;
  /** Their name in the most recent shared trip. */
  name: string;
  /** Up to two shared trip names, newest first. */
  trips: string[];
}

export interface PersonView {
  id: string; name: string; status: 'active' | 'pending'; isMember: boolean; bank: 'none' | 'pending' | 'approved';
  /** The person who created the trip. Left out by an older server. */
  isOrganiser?: boolean;
  isAdmin?: boolean;
  /** A guest's current account (the approved one, else the one waiting). Sent only to members and to that guest. */
  bankAccount?: { bankName: string; accountNumberMasked: string; holderName: string };
  gender?: Gender | null;
  avatarUrl?: string | null;
}

export interface ExpenseSportMeta {
  court: number;
  shuttlecocks: { qty: number; unitPrice: number }[];
  extra: number;
  rule: SportRule;
  entries: SportParticipantEntry[];
  maleSlotRate: number;
  femaleSlotRate: number;
}

export interface ExpenseMeta {
  sport?: ExpenseSportMeta;
}

export interface ExpenseView {
  id: string; description: string; amount: number; spentOn: string; payerId: string; mode: SplitMode;
  status: ExpenseStatus; rejectReason: string | null; disabledByName: string | null; createdById: string;
  shares: { participantId: string; amount: number; inputValue: number }[];
  meta?: ExpenseMeta | null;
  rootId?: string;
  history?: ExpenseHistoryItem[];
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
  trip: { id: string; name: string; currency: 'VND'; fewestTransfers: boolean; archived: boolean; version: number; total: number; preset?: GroupPreset; defaultLang?: 'en' | 'vi' };
  me: { kind: ActorKind; participantId: string | null; participantPending: boolean; isOrganiser: boolean; isAdmin?: boolean };
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
export interface TripListItem { id: string; name: string; archived: boolean; myBalance: number; preset?: GroupPreset }
export interface ActivityItem {
  id: string; action: ActivityAction; actorName: string | null; deviceShort: string | null;
  details: Record<string, unknown>; createdAt: string;
}

export interface PickerView {
  people: { id: string; name: string; status: 'active' | 'pending'; isMember: boolean; lastUsedHere: boolean; activeElsewhere: string | null }[];
  myPick: string | null;
}

export interface ExpenseInput {
  /** 1–80 characters. */
  description: string;
  amount: number;
  /** YYYY-MM-DD */
  spentOn: string;
  payerId: string;
  mode: SplitMode;
  entries: SplitEntry[];
  meta?: ExpenseMeta | null;
}

export type BankInput = BankFields & { consent: true };
export interface PayInfo {
  to: { id: string; name: string };
  /** What the actor currently owes `to` (0 when looking at your own details). */
  amount: number;
  bankState: 'ok' | 'none' | 'pending';
  bank: { bin: string; bankName: string; accountNumber: string; accountNumberMasked: string; holderName: string } | null;
  /** Transfer note for this payer → receiver pair; '' when looking at your own details. */
  refCode: string;
  /** VietQR string, only when bankState is 'ok' and someone else is paying. */
  payload: string | null;
  inFlight: PaymentView[];
}
