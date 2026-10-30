export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'LINK_DEAD'
  | 'VALIDATION'
  | 'ALREADY_HANDLED'
  | 'PERSON_PENDING'
  | 'PERSON_LEFT'
  | 'TRIP_ARCHIVED'
  | 'DAILY_LIMIT'
  | 'RATE_LIMITED'
  | 'LAST_IDENTITY'
  | 'MERGE_STALE'
  | 'FUND_SHORT'
  | 'RATING_LIMIT'
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
  | 'person_left'
  | 'person_restored'
  | 'member_joined'
  | 'member_rejoined'
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
  | 'trip_unarchived'
  | 'fewest_changed'
  | 'membership_requested'
  | 'membership_approved'
  | 'membership_rejected'
  | 'admin_promoted'
  | 'admin_demoted'
  | 'expense_rolled_back'
  | 'income_added'
  | 'income_edited'
  | 'income_disabled'
  | 'income_enabled'
  | 'income_rolled_back'
  | 'ratings_changed';

import type { Gender, SplitEntry, SplitMode, SportParticipantEntry, SportRule } from './split';
import type { Balances, ExpenseStatus, PaymentStatus } from './balances';
import type { Transfer } from './transfers';
import type { ActorKind } from './permissions';
import type { MatchReason, NameCandidate } from './names';
import type { IncomeStatus } from './fund';

export type AuthProvider = 'google' | 'zalo';

export interface MeUserView {
  id: string;
  email: string | null;
  name: string;
  gender?: Gender | null;
  avatarUrl?: string | null;
  consentAt: string | null;
  providers: AuthProvider[];
  /** The name on the linked Zalo login, when one is linked. */
  zaloName?: string | null;
}

export interface IncomingMergeRequest {
  id: string;
  provider: AuthProvider;
  expiresAt: string;
  survivor: { name: string; avatarUrl: string | null; email: string | null; providers: AuthProvider[] };
  /** Active memberships of each account. */
  groups: { survivor: number; merged: number };
  released: { provider: AuthProvider; email: string | null }[];
}

export interface OutgoingMergeRequest {
  id: string;
  provider: AuthProvider;
  status: 'pending' | 'accepted' | 'declined';
  expiresAt: string;
  /** The other account's CoinCrew name when the request was made. */
  otherName?: string;
  /** The verified login: the Zalo name, or the Google email. */
  identityLabel?: string;
}

export interface MeResponse {
  user: MeUserView | null;
  /** False when ZALO_APP_ID or ZALO_APP_SECRET is missing. */
  signIn: { zalo: boolean };
  /** Both empty when signed out. */
  mergeRequests: { incoming: IncomingMergeRequest[]; outgoing: OutgoingMergeRequest[] };
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
  /** `inputValue: null` is a blank (automatic) box. */
  shares: { participantId: string; amount: number; inputValue: number | null }[];
  meta?: ExpenseMeta | null;
}

export type GroupPreset = 'trip' | 'sport';

export interface BankFields { bin: string; accountNumber: string; holderName: string }
/** The signed-in user's own saved bank details (GET /api/me/bank). */
export type MyBankResponse = BankFields;
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
  id: string; name: string; status: 'active' | 'pending' | 'left'; isMember: boolean; bank: 'none' | 'pending' | 'approved';
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
  /** The whole expense came out of the group fund: no shares, and it stays off the personal ledger. */
  paidFromFund?: boolean;
}

export interface ExpenseView {
  id: string; description: string; amount: number; spentOn: string; payerId: string; mode: SplitMode;
  status: ExpenseStatus; rejectReason: string | null; disabledByName: string | null; createdById: string;
  /** Set by the snapshot; the merged feed sorts by it. */
  createdAt?: string;
  /** `inputValue: null` is a blank (automatic) box. */
  shares: { participantId: string; amount: number; inputValue: number | null }[];
  meta?: ExpenseMeta | null;
  rootId?: string;
  history?: ExpenseHistoryItem[];
}
export interface IncomeInput {
  amount: number;
  /** YYYY-MM-DD */
  spentOn: string;
  /** 1–80 characters. */
  description: string;
  /** Reserved for categories; v1 accepts only null or leaving it out. */
  category?: null;
}

export interface IncomeHistoryItem {
  id: string; amount: number; spentOn: string; description: string;
  /** Who wrote this version. */
  createdById: string;
  createdAt: string;
}

export interface IncomeView {
  id: string; rootId: string; amount: number; spentOn: string; description: string;
  /** The admin who first added it. */
  addedById: string;
  /** Who wrote the latest version. */
  createdById: string;
  createdAt: string;
  status: IncomeStatus;
  disabledByName: string | null;
  meta: { category: string | null };
  /** Older versions, newest first. */
  history: IncomeHistoryItem[];
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
  | { kind: 'membership'; requestId: string; participantId: string; userName: string; userEmail: string | null };

export interface RatingsView {
  enabled: boolean;
  /** Total stars received per active participantId. */
  totalStars: Record<string, number>;
  /** Max stars each signed-in member can allocate (RATING_STAR_MULTIPLIER * activeCount). */
  maxStars: number;
  /** Caller's own allocations (targetParticipantId -> stars). Empty object for guests/viewers. */
  myAllocations: Record<string, number>;
}
export interface TripView {
  trip: { id: string; name: string; currency: 'VND'; fewestTransfers: boolean; archived: boolean; version: number; total: number; preset?: GroupPreset; defaultLang?: 'en' | 'vi'; ratingsEnabled?: boolean };
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
  /** Sport groups only; null otherwise. Left out by an older server: read it as null. */
  fund?: { balance: number; added: number; spent: number; incomes: IncomeView[] } | null;
  /** Sport groups only; null otherwise. Left out by an older server: read it as null. */
  ratings?: RatingsView | null;
}
export interface TripListItem { id: string; name: string; archived: boolean; myBalance: number; preset?: GroupPreset }
export interface ActivityItem {
  id: string; action: ActivityAction; actorName: string | null; deviceShort: string | null;
  details: Record<string, unknown>; createdAt: string;
}

export interface PickerView {
  people: { id: string; name: string; status: 'active' | 'pending'; isMember: boolean; lastUsedHere: boolean; activeElsewhere: string | null }[];
  myPick: string | null;
  /** The signed-in viewer when they are not a member here. Left out by an older server. */
  account?: { name: string; needsGender: boolean } | null;
  /** That viewer's own name in this group, if they left it. */
  myLeftName?: { id: string; name: string } | null;
}

export interface JoinResponse { participantId: string; rejoined: boolean }

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
