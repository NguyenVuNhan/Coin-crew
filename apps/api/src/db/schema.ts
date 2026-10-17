import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  consentAt: text('consent_at'),
  createdAt: text('created_at').notNull(),
});

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
  fewestTransfers: integer('fewest_transfers').notNull().default(1),
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
    status: text('status', { enum: ['active', 'pending', 'merged'] }).notNull(),
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

export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id').notNull(),
    description: text('description').notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('VND'),
    spentOn: text('spent_on').notNull(),
    payerId: text('payer_id').notNull(),
    splitMode: text('split_mode').notNull(),
    status: text('status', { enum: ['approved', 'pending', 'rejected', 'disabled'] }).notNull(),
    rejectReason: text('reject_reason'),
    disabledByUserId: text('disabled_by_user_id'),
    createdByParticipantId: text('created_by_participant_id').notNull(),
    createdByDevice: text('created_by_device'),
    metaJson: text('meta_json'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('expenses_trip_id_idx').on(t.tripId)],
);

export const expenseShares = sqliteTable(
  'expense_shares',
  {
    expenseId: text('expense_id').notNull(),
    participantId: text('participant_id').notNull(),
    inputValue: integer('input_value').notNull(),
    amount: integer('amount').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.expenseId, t.participantId] }),
    index('expense_shares_participant_id_idx').on(t.participantId),
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

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id').notNull(),
    fromId: text('from_id').notNull(),
    toId: text('to_id').notNull(),
    amountClaimed: integer('amount_claimed').notNull(),
    amountConfirmed: integer('amount_confirmed'),
    currency: text('currency').notNull().default('VND'),
    status: text('status', { enum: ['says_paid', 'confirmed', 'rejected', 'disabled'] }).notNull(),
    notArrivedAt: text('not_arrived_at'),
    recordedByParticipantId: text('recorded_by_participant_id').notNull(),
    recordedByDevice: text('recorded_by_device'),
    confirmedByParticipantId: text('confirmed_by_participant_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('payments_trip_id_idx').on(t.tripId)],
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
