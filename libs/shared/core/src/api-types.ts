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
  | 'TRY_AGAIN'
  | 'ALREADY_WAITING'
  | 'ALREADY_CLAIMED'
  | 'BOTH_SIGNED_IN'
  | 'PROPOSAL_PENDING'
  | 'CONFLICT'
  | 'ZALO_TOKEN_INVALID'
  | 'INTERNAL';

/** `POST /api/auth/zalo-mini`: the Zalo Mini App handshake (and, with `consent`, its sign-up). */
export type ZaloMiniRequest = {
  accessToken: string;
  consent?: true;
  profile?: { name: string; avatar: string | null };
};

export type ZaloMiniResponse =
  | { status: 'signed_in'; sessionToken: string }
  | { status: 'guest'; deviceId: string };

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
  | 'person_unlinked'
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
  | 'payment_revised'
  | 'payment_disabled'
  | 'payment_enabled'
  | 'links_regenerated'
  | 'trip_archived'
  | 'trip_unarchived'
  | 'fewest_changed'
  | 'round_transfers_changed'
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
  | 'ratings_changed'
  | 'theme_changed'
  | 'merge_proposed'
  | 'merge_proposal_accepted'
  | 'merge_proposal_declined';

import type { Gender, SplitEntry, SplitMode, SportParticipantEntry, SportRule } from './split';
import type { Balances, ExpenseStatus, PaymentStatus } from './balances';
import type { Transfer } from './transfers';
import type { ActorKind } from './permissions';
import type { MatchReason, NameCandidate } from './names';
import type { IncomeStatus } from './fund';
import type { PersonKey, PersonItem } from './people';
import type { MergePlan } from './mergePlan';
import type { ThemeId } from './themes';

export type AuthProvider = 'google' | 'zalo';

export interface MeUserView {
  id: string;
  email: string | null;
  name: string;
  gender?: Gender | null;
  avatarUrl?: string | null;
  theme?: ThemeId | null;
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

export interface JoiningMergeRequest {
  id: string;
  expiresAt: string;
  zalo: { name: string; avatarUrl: string | null };
  /** Groups the Zalo account is an active member of; empty for a brand-new account. */
  groups: { tripId: string; name: string }[];
  /** Groups both accounts are in: their two people become one. */
  collapsing: { tripId: string; name: string; zaloPersonName: string; yourPersonName: string }[];
  /** Payments this Zalo account marked to a guest while waiting: accepting confirms them. */
  autoConfirm?: { paymentId: string; tripName: string; toName: string; amount: number }[];
}

export interface ClaimStatus {
  id: string;
  tripId: string;
  participantId: string;
  name: string;
  expiresAt: string;
}

export interface MeResponse {
  user: MeUserView | null;
  /** False when ZALO_APP_ID or ZALO_APP_SECRET is missing. */
  signIn: { zalo: boolean };
  /** Both empty when signed out. */
  mergeRequests: {
    incoming: IncomingMergeRequest[];
    outgoing: OutgoingMergeRequest[];
    joining?: JoiningMergeRequest[];
    claim?: ClaimStatus | null;
  };
}

export interface UpdateProfileInput {
  name?: string;
  gender?: Gender | null;
  avatarUrl?: string | null;
  theme?: ThemeId | null;
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

export type GroupPreset = 'trip' | 'sport' | 'direct';

export interface BankFields { bin: string; accountNumber: string; holderName: string }
/** The signed-in user's own saved bank details (GET /api/me/bank). */
export type MyBankResponse = BankFields;
/** A person to add when creating a trip: a plain name, or someone with an account from the recent-people list. */
/** `zaloSub`: a Zalo friend's id (1–64 chars, once per request); they become this person's member on sign-in. */
export type CreateTripPerson = { name: string; userId?: string; gender?: Gender | null; zaloSub?: string };
/** Plain strings are still accepted so an older open client keeps working. */
export interface CreateTripInput {
  name: string;
  myName?: string;
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

/** `GET /api/me/people/candidates`: someone from one of my groups, to pick into a quick expense with `POST /api/me/ledger/people`. */
export interface GroupPerson {
  /** Their participant id in `tripName`; signed-in people appear once, from their newest shared group. */
  participantId: string;
  name: string;
  userId: string | null;
  tripName: string;
}

export interface PersonView {
  id: string; name: string; status: 'active' | 'pending' | 'left'; isMember: boolean; bank: 'none' | 'pending' | 'approved';
  /** The person who created the trip. Left out by an older server. */
  isOrganiser?: boolean;
  isAdmin?: boolean;
  /** Tied to a Zalo account (never the id itself). Left out by an older server. */
  zaloLinked?: boolean;
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

export type PaidBy = 'self' | 'friend';
export interface PaymentMeta { expenseId: string; paidBy: PaidBy }
export interface SlotTile { gender: 'F' | 'M'; amount: number }
/** No row to pay. `claim` is set when a Zalo account waiting to join someone opened it: they owe nothing here. */
export interface ExpensePayNoRow {
  row: null;
  claim?: { name: string; expiresAt: string };
}

export interface ExpensePayView {
  expense: { id: string; description: string; spentOn: string; amount: number };
  payer: { id: string; name: string };
  row: { participantId: string; name: string; isMember: boolean; slots: number; share: number; remaining: number; tiles: SlotTile[] };
  viewer: PaidBy | 'claim';
  claim?: { name: string; expiresAt: string };
  paid: { paymentId: string; amount: number; status: PaymentStatus; paidBy: PaidBy; notArrived: boolean; claimPending?: true }[];
  pay: PayInfo | null;
}

export interface PaymentView {
  id: string; fromId: string; toId: string; amountClaimed: number; amountConfirmed: number | null;
  status: PaymentStatus; notArrived: boolean; createdAt: string;
  disabledByName: string | null;
  /** The part of a People settlement that runs against the money handed over: no cash moved in this group. */
  throughPeople?: boolean;
  expenseId?: string;
  paidBy?: PaidBy;
  confirmedById?: string | null;
  claimPending?: true;
}
export type Approval =
  | { kind: 'expense'; expenseId: string }
  | { kind: 'name'; participantId: string; matches: (NameCandidate & { reason: MatchReason })[] }
  | { kind: 'bank'; bankId: string; participantId: string; bankName: string; accountNumber: string; holderName: string }
  | { kind: 'payment'; paymentId: string }
  | { kind: 'expense_payments'; expenseId: string; paymentIds: string[] }
  | { kind: 'not_arrived'; paymentId: string }
  | { kind: 'membership'; requestId: string; participantId: string; userName: string; userEmail: string | null }
  | { kind: 'proposal'; proposalId: string; guestPid: string; intoPid: string | null; targetUserName: string | null; requestedByName: string };

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
  trip: { id: string; name: string; currency: 'VND'; fewestTransfers: boolean; roundTransfers?: boolean; archived: boolean; version: number; total: number; preset?: GroupPreset; defaultLang?: 'en' | 'vi'; ratingsEnabled?: boolean; theme?: ThemeId | null };
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

/** One line of `GET /api/me/activity`: an activity row from any of my groups or my own ledger. */
export interface MyActivityItem extends ActivityItem {
  tripId: string;
  tripName: string;
  /** 'direct' is my personal quick-expense ledger. */
  kind: 'group' | 'direct';
  /** Names for the participant ids in `details` (`fromId`, `toId`, `participantId`). */
  names: Record<string, string>;
}

export interface MyActivityPage {
  items: MyActivityItem[];
  /** Opaque cursor `<createdAt>~<id>` for `?before=`, or null on the last page. */
  next: string | null;
}

export interface PickerView {
  /** `zaloLinked`: tied to a Zalo account (never the id itself); left out by an older server. */
  people: { id: string; name: string; status: 'active' | 'pending'; isMember: boolean; zaloLinked?: boolean; lastUsedHere: boolean; activeElsewhere: string | null; slots?: number }[];
  myPick: string | null;
  /** The signed-in viewer when they are not a member here. Left out by an older server. */
  account?: { name: string; needsGender: boolean } | null;
  /** That viewer's own name in this group, if they left it. */
  myLeftName?: { id: string; name: string } | null;
  expense?: { id: string; payerId: string } | null;
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

export interface PersonSummary {
  key: PersonKey;
  name: string;
  nickname: string | null;
  userId: string | null;
  groupLabel: string | null;
  total: number;
  items: PersonItem[];
  /**
   * Settlements this person recorded ("I've paid") that the caller can confirm with
   * `POST /api/me/settlements/:sid/confirm`. `amount` is the settlement's net, always > 0;
   * `direction` says who it moves money to, from the caller's side.
   */
  waiting: PersonWaitingSettlement[];
  /**
   * Participants folded into this person by the caller's "same person" links (not the person's
   * own ledger row). Each can be split off with `DELETE /api/me/people/link/:participantId`.
   */
  linked: PersonLinkedEntry[];
}

export interface PersonLinkedEntry {
  participantId: string;
  name: string;
  tripName: string;
  kind: 'group' | 'direct';
}

export interface PersonWaitingSettlement {
  settlementId: string;
  amount: number;
  direction: 'toOwner' | 'fromOwner';
}

/** `GET /api/me/people/summary`. `incomplete`: some groups were left out to stay within the query budget; ask again. */
export interface PeopleSummaryResponse {
  people: PersonSummary[];
  incomplete: boolean;
}

/** A place (group or the caller's Quick Expenses ledger) a person has a participant in. */
export interface MergeGroupRef { tripId: string; tripName: string; kind: 'group' | 'direct' }

/** One row of the person page's "Merge with…" picker. */
export interface MergeCandidate {
  key: PersonKey;
  name: string;
  nickname: string | null;
  avatarUrl: string | null;
  /** Only when the caller shares an active group with this user. */
  signIn: { provider: 'google' | 'zalo'; label: string } | null;
  groups: MergeGroupRef[];
  /** A likely duplicate of the person on the page (findSimilarNames). */
  similar: boolean;
  plan: MergePlan;
}

/** `GET /api/me/people/:key/merge-options`. Candidates: similar ones first, then A–Z. */
export interface MergeOptionsResponse {
  person: { key: PersonKey; groups: (MergeGroupRef & { participantId: string; name: string; canRename: boolean })[] };
  candidates: MergeCandidate[];
}

export interface RequestView {
  ownerName: string;
  total: number;
  items: PersonItem[];
  settled: boolean;
  pay: PayInfo | null;
  settlementWaiting: boolean;
}

/** A merge proposal (someone said a guest is the same person as an account, or as another guest). */
export interface ProposalView {
  id: string;
  tripId: string;
  tripName: string;
  tripKind: 'group' | 'direct';
  guestName: string;
  /** The guest as the caller's people key (canonicalKey of p:guestPid). */
  guestKey: PersonKey;
  requestedByName: string;
  targetUserName: string | null;
  waitingFor: ('user' | 'admin')[];
  status: 'pending' | 'approved' | 'declined' | 'cancelled';
}

/** `GET /api/me/proposals`. Outgoing: pending ones, plus ones decided in the last 7 days. */
export interface ProposalsResponse { incoming: ProposalView[]; outgoing: ProposalView[] }

export type ZaloChatLookup =
  | { linked: false }
  | { linked: true; tripId: string; tripName: string; joinToken: string; isMember: boolean };

export type FeedbackType = 'bug' | 'idea' | 'other';

/** `POST /api/feedback`. Anonymous unless `contactMe`; `contactText` is only read for guests. */
export interface FeedbackRequest {
  message: string;
  type: FeedbackType | null;
  /** Route name such as `trip-expenses`, never a URL. */
  screen: string;
  device: 'phone' | 'desktop';
  lang: 'vi' | 'en';
  appVersion: string;
  contactMe: boolean;
  contactText?: string;
}
