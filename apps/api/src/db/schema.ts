import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { check } from 'drizzle-orm/sqlite-core/checks';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    googleSub: text('google_sub'),
    zaloSub: text('zalo_sub'),
    email: text('email'),
    name: text('name').notNull(),
    gender: text('gender'),
    avatarUrl: text('avatar_url'),
    customProfile: integer('custom_profile').notNull().default(0),
    consentAt: text('consent_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('users_google_sub_unique').on(t.googleSub).where(sql`${t.googleSub} IS NOT NULL`),
    uniqueIndex('users_zalo_sub_unique').on(t.zaloSub).where(sql`${t.zaloSub} IS NOT NULL`),
    check('users_identity_check', sql`${t.googleSub} IS NOT NULL OR ${t.zaloSub} IS NOT NULL`),
  ],
);

export const accountMergeRequests = sqliteTable(
  'account_merge_requests',
  {
    id: text('id').primaryKey(),
    survivorUserId: text('survivor_user_id').notNull(),
    mergedUserId: text('merged_user_id').notNull(),
    provider: text('provider', { enum: ['google', 'zalo'] }).notNull(),
    providerSub: text('provider_sub').notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'declined', 'cancelled'] }).notNull(),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    decidedAt: text('decided_at'),
  },
  (t) => [
    index('account_merge_requests_merged_idx').on(t.mergedUserId, t.status),
    index('account_merge_requests_survivor_idx').on(t.survivorUserId, t.status),
  ],
);

export const sessions = sqliteTable('sessions', {
  idHash: text('id_hash').primaryKey(),
  userId: text('user_id').notNull(),
  expiresAt: text('expires_at').notNull(),
});

export const trips = sqliteTable('trips', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  preset: text('preset', { enum: ['trip', 'sport'] }).notNull().default('trip'),
  currency: text('currency').notNull().default('VND'),
  fewestTransfers: integer('fewest_transfers').notNull().default(0),
  defaultLang: text('default_lang').notNull().default('vi'),
  organiserUserId: text('organiser_user_id').notNull(),
  groupToken: text('group_token').notNull().unique(),
  viewToken: text('view_token').notNull().unique(),
  version: integer('version').notNull().default(0),
  createdAt: text('created_at').notNull(),
  archivedAt: text('archived_at'),
});

export const participants = sqliteTable(
  'participants',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id').notNull(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    gender: text('gender', { enum: ['M', 'F'] }),
    userId: text('user_id'),
    isAdmin: integer('is_admin').notNull().default(0),
    status: text('status', { enum: ['active', 'pending', 'merged', 'left'] }).notNull(),
    mergedInto: text('merged_into'),
    sortOrder: integer('sort_order').notNull(),
    createdByDevice: text('created_by_device'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('participants_trip_id_idx').on(t.tripId),
    index('participants_trip_id_normalized_name_idx').on(t.tripId, t.normalizedName),
  ],
);

export const membershipRequests = sqliteTable(
  'membership_requests',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id').notNull(),
    participantId: text('participant_id').notNull(),
    userId: text('user_id').notNull(),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('membership_requests_trip_id_idx').on(t.tripId)],
);

export const devices = sqliteTable('devices', {
  idHash: text('id_hash').primaryKey(),
  createdAt: text('created_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
});

export const deviceParticipants = sqliteTable(
  'device_participants',
  {
    deviceHash: text('device_hash').notNull(),
    tripId: text('trip_id').notNull(),
    participantId: text('participant_id').notNull(),
    lastUsedAt: text('last_used_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deviceHash, t.tripId] }),
    index('device_participants_trip_id_idx').on(t.tripId),
  ],
);

export const bankDetails = sqliteTable(
  'bank_details',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    participantId: text('participant_id'),
    bin: text('bin').notNull(),
    accountNumber: text('account_number').notNull(),
    holderName: text('holder_name').notNull(),
    status: text('status', { enum: ['pending', 'approved', 'replaced', 'rejected', 'removed'] }).notNull(),
    approvedByUserId: text('approved_by_user_id'),
    consentAt: text('consent_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('bank_details_participant_id_idx').on(t.participantId),
    index('bank_details_user_id_idx').on(t.userId),
  ],
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    rootId: text('root_id').notNull(),
    parentId: text('parent_id'),
    isLatest: integer('is_latest').notNull().default(1),
    tripId: text('trip_id').notNull(),
    type: text('type', { enum: ['expense', 'payment'] }).notNull(),
    description: text('description').notNull().default(''),
    amount: integer('amount').notNull(),
    amountConfirmed: integer('amount_confirmed'),
    currency: text('currency').notNull().default('VND'),
    spentOn: text('spent_on').notNull(),
    payerId: text('payer_id').notNull(),
    toId: text('to_id'),
    splitMode: text('split_mode').notNull().default('equal'),
    status: text('status', {
      enum: ['approved', 'pending', 'rejected', 'disabled', 'superseded', 'says_paid', 'confirmed'],
    }).notNull(),
    rejectReason: text('reject_reason'),
    notArrivedAt: text('not_arrived_at'),
    disabledByUserId: text('disabled_by_user_id'),
    createdByParticipantId: text('created_by_participant_id').notNull(),
    createdByDevice: text('created_by_device'),
    confirmedByParticipantId: text('confirmed_by_participant_id'),
    metaJson: text('meta_json'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('transactions_trip_type_latest_idx').on(t.tripId, t.type, t.isLatest),
    index('transactions_root_idx').on(t.rootId),
  ],
);

export const transactionShares = sqliteTable(
  'transaction_shares',
  {
    transactionId: text('transaction_id').notNull(),
    participantId: text('participant_id').notNull(),
    inputValue: integer('input_value').notNull(),
    amount: integer('amount').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.participantId] }),
    index('transaction_shares_participant_idx').on(t.participantId),
  ],
);

export const paymentRefs = sqliteTable(
  'payment_refs',
  {
    code: text('code').notNull(),
    tripId: text('trip_id').notNull(),
    fromId: text('from_id').notNull(),
    toId: text('to_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('payment_refs_trip_id_idx').on(t.tripId),
    uniqueIndex('payment_refs_trip_id_code_uidx').on(t.tripId, t.code),
  ],
);

export const activity = sqliteTable(
  'activity',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id').notNull(),
    actorParticipantId: text('actor_participant_id'),
    actorUserId: text('actor_user_id'),
    actorDevice: text('actor_device'),
    action: text('action').notNull(),
    detailsJson: text('details_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('activity_trip_id_idx').on(t.tripId)],
);

export const tripViews = sqliteTable('trip_views', {
  tripId: text('trip_id').primaryKey(),
  version: integer('version').notNull(),
  json: text('json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const opsAlerts = sqliteTable(
  'ops_alerts',
  {
    day: text('day').notNull(),
    metric: text('metric').notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.metric] })],
);
