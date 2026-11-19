import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { check } from 'drizzle-orm/sqlite-core/checks';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    googleSub: text('google_sub'),
    zaloSub: text('zalo_sub'),
    zaloName: text('zalo_name'),
    email: text('email'),
    name: text('name').notNull(),
    gender: text('gender'),
    avatarUrl: text('avatar_url'),
    theme: text('theme'),
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
    otherName: text('other_name'),
    identityLabel: text('identity_label'),
    dismissedAt: text('dismissed_at'),
    initiatedBy: text('initiated_by', { enum: ['survivor', 'merged'] }).notNull().default('survivor'),
    claimTripId: text('claim_trip_id'),
    claimParticipantId: text('claim_participant_id'),
  },
  (t) => [
    index('account_merge_requests_merged_idx').on(t.mergedUserId, t.status),
    index('account_merge_requests_survivor_idx').on(t.survivorUserId, t.status),
    index('account_merge_requests_claim_idx').on(t.claimTripId, t.claimParticipantId, t.status),
  ],
);

export const sessions = sqliteTable('sessions', {
  idHash: text('id_hash').primaryKey(),
  userId: text('user_id').notNull(),
  expiresAt: text('expires_at').notNull(),
});

export const trips = sqliteTable(
  'trips',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    preset: text('preset', { enum: ['trip', 'sport', 'direct'] }).notNull().default('trip'),
    currency: text('currency').notNull().default('VND'),
    fewestTransfers: integer('fewest_transfers').notNull().default(0),
    roundTransfers: integer('round_transfers').notNull().default(0),
    ratingsEnabled: integer('ratings_enabled').notNull().default(0),
    theme: text('theme'),
    defaultLang: text('default_lang').notNull().default('vi'),
    organiserUserId: text('organiser_user_id').notNull(),
    groupToken: text('group_token').notNull().unique(),
    viewToken: text('view_token').notNull().unique(),
    version: integer('version').notNull().default(0),
    createdAt: text('created_at').notNull(),
    archivedAt: text('archived_at'),
  },
  (t) => [
    uniqueIndex('trips_organiser_direct_idx')
      .on(t.organiserUserId)
      .where(sql`${t.preset} = 'direct'`),
  ],
);

export const participants = sqliteTable(
  'participants',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id').notNull(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    gender: text('gender', { enum: ['M', 'F'] }),
    userId: text('user_id'),
    zaloSub: text('zalo_sub'),
    isAdmin: integer('is_admin').notNull().default(0),
    status: text('status', { enum: ['active', 'pending', 'merged', 'left'] }).notNull(),
    mergedInto: text('merged_into'),
    sortOrder: integer('sort_order').notNull(),
    createdByDevice: text('created_by_device'),
    createdAt: text('created_at').notNull(),
    requestToken: text('request_token'),
  },
  (t) => [
    uniqueIndex('participants_request_token_unique').on(t.requestToken),
    uniqueIndex('participants_trip_zalo_sub_unique')
      .on(t.tripId, t.zaloSub)
      .where(sql`${t.zaloSub} IS NOT NULL`),
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
  (t) => [
    index('membership_requests_trip_id_idx').on(t.tripId),
    uniqueIndex('membership_requests_one_pending')
      .on(t.participantId)
      .where(sql`${t.status} = 'pending'`),
    uniqueIndex('membership_requests_one_pending_user')
      .on(t.tripId, t.userId)
      .where(sql`${t.status} = 'pending'`),
  ],
);

/**
 * "This guest is that person": a merge someone asked for on behalf of others. It waits for the
 * target user (needs_user) and/or a group admin (needs_admin). Shares the one-pending-per-guest
 * rule with membership_requests.
 */
export const mergeProposals = sqliteTable(
  'merge_proposals',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id').notNull(),
    guestPid: text('guest_pid').notNull(),
    intoPid: text('into_pid'),
    targetUserId: text('target_user_id'),
    requestedByUserId: text('requested_by_user_id').notNull(),
    needsUser: integer('needs_user').notNull().default(0),
    needsAdmin: integer('needs_admin').notNull().default(0),
    userAcceptedAt: text('user_accepted_at'),
    adminAcceptedAt: text('admin_accepted_at'),
    status: text('status', { enum: ['pending', 'approved', 'declined', 'cancelled'] }).notNull(),
    createdAt: text('created_at').notNull(),
    decidedAt: text('decided_at'),
  },
  (t) => [
    index('merge_proposals_trip_id_idx').on(t.tripId),
    uniqueIndex('merge_proposals_one_pending')
      .on(t.guestPid)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export const devices = sqliteTable('devices', {
  idHash: text('id_hash').primaryKey(),
  zaloSub: text('zalo_sub'),
  createdAt: text('created_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
});

export const zaloChatLinks = sqliteTable(
  'zalo_chat_links',
  {
    chatId: text('chat_id').primaryKey(),
    tripId: text('trip_id').notNull(),
    linkedByUserId: text('linked_by_user_id'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('zalo_chat_links_trip_id_idx').on(t.tripId)],
);

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

export const deviceExpenseGrants = sqliteTable(
  'device_expense_grants',
  {
    deviceHash: text('device_hash').notNull(),
    tripId: text('trip_id').notNull(),
    expenseRootId: text('expense_root_id').notNull(),
    participantId: text('participant_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deviceHash, t.expenseRootId] }),
    index('device_expense_grants_trip_idx').on(t.tripId),
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
    type: text('type', { enum: ['expense', 'payment', 'income'] }).notNull(),
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
    claimRequestId: text('claim_request_id'),
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
    /** 1 when the box was left blank and the share is what the typed boxes left (exact amounts and percent). */
    inputAuto: integer('input_auto').notNull().default(0),
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
    uniqueIndex('payment_refs_trip_pair_uidx').on(t.tripId, t.fromId, t.toId),
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

export const playerRatings = sqliteTable(
  'player_ratings',
  {
    tripId: text('trip_id').notNull(),
    raterParticipantId: text('rater_participant_id').notNull(),
    targetParticipantId: text('target_participant_id').notNull(),
    stars: integer('stars').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.raterParticipantId, t.targetParticipantId] }),
    index('player_ratings_trip_id_idx').on(t.tripId),
  ],
);

export const personLinks = sqliteTable(
  'person_links',
  {
    ownerUserId: text('owner_user_id').notNull(),
    participantId: text('participant_id').notNull(),
    // A personal-ledger participant id.
    personPid: text('person_pid').notNull(),
    // 'import': the person's own source, written when their ledger row was made from them.
    // 'merge': made by the owner ("Gộp với…"); only these can be undone.
    kind: text('kind', { enum: ['import', 'merge'] }).notNull().default('merge'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.ownerUserId, t.participantId] })],
);

export const nicknames = sqliteTable(
  'nicknames',
  {
    ownerUserId: text('owner_user_id').notNull(),
    personKey: text('person_key').notNull(),
    nickname: text('nickname').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.ownerUserId, t.personKey] })],
);

export const participantMerges = sqliteTable('participant_merges', {
  id: text('id').primaryKey(),
  tripId: text('trip_id').notNull(),
  fromId: text('from_id').notNull(),
  intoId: text('into_id').notNull(),
  actorUserId: text('actor_user_id').notNull(),
  createdAt: text('created_at').notNull(),
});

export const participantMergeRows = sqliteTable(
  'participant_merge_rows',
  {
    mergeId: text('merge_id').notNull(),
    tableName: text('table_name').notNull(),
    rowKey: text('row_key').notNull(),
    beforeJson: text('before_json').notNull(),
  },
  (t) => [index('participant_merge_rows_merge_id_idx').on(t.mergeId)],
);

/**
 * One row per settlement created with a client idempotency key (one per "Paid in cash" sheet or
 * request page load). Written first in the settlement's batch, so a retry of the same submit hits
 * the primary key and gets the settlement that already exists instead of a second one.
 */
export const settlementKeys = sqliteTable('settlement_keys', {
  key: text('key').primaryKey(),
  settlementId: text('settlement_id').notNull(),
  createdAt: text('created_at').notNull(),
});

/**
 * Idempotency keys for recorded payments, modelled on `settlement_keys`. A retried request with the
 * same key hits the primary key and gets the payment that already exists. `paymentId` is the
 * payment's first row; kept forever. See migration 0022.
 */
export const paymentKeys = sqliteTable('payment_keys', {
  key: text('key').primaryKey(),
  tripId: text('trip_id').notNull(),
  paymentId: text('payment_id').notNull(),
  createdAt: text('created_at').notNull(),
});

/** Anonymous in-app feedback (no user/device/trip column on purpose). See migration 0013. */
export const feedback = sqliteTable(
  'feedback',
  {
    id: text('id').primaryKey(),
    type: text('type'),
    message: text('message').notNull(),
    screen: text('screen').notNull(),
    device: text('device').notNull(),
    lang: text('lang').notNull(),
    appVersion: text('app_version').notNull(),
    contact: text('contact'),
    /** Rounded down to the hour. */
    createdAt: text('created_at').notNull(),
    deliveredAt: text('delivered_at'),
  },
  (t) => [
    index('feedback_delivered_at_idx').on(t.deliveredAt),
    index('feedback_created_at_idx').on(t.createdAt),
  ],
);

/** Feedback sent per device per hour; key = sha256(deviceHash + bucket), unlinked from `feedback`. */
export const feedbackRate = sqliteTable(
  'feedback_rate',
  {
    key: text('key').primaryKey(),
    bucket: text('bucket').notNull(),
    count: integer('count').notNull(),
  },
  (t) => [index('feedback_rate_bucket_idx').on(t.bucket)],
);

export const userNotificationSettings = sqliteTable('user_notification_settings', {
  userId: text('user_id').primaryKey().references(() => users.id),
  transactionCrud: integer('transaction_crud').notNull().default(1),
  loanReminders: integer('loan_reminders').notNull().default(1),
  monthlyNotice: integer('monthly_notice').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
});

export const userPersonalSettings = sqliteTable('user_personal_settings', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  enabled: integer('enabled').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});

export const personalWallets = sqliteTable(
  'personal_wallets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    currency: text('currency').notNull().default('VND'),
    startAmount: integer('start_amount').notNull(),
    startDate: text('start_date').notNull(),
    isDefault: integer('is_default').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('personal_wallets_user_idx').on(t.userId),
    uniqueIndex('personal_wallets_default_uq')
      .on(t.userId)
      .where(sql`${t.isDefault} = 1`),
  ],
);

export const personalWalletSettings = sqliteTable('personal_wallet_settings', {
  walletId: text('wallet_id')
    .primaryKey()
    .references(() => personalWallets.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('everyday'),
  startCostVnd: integer('start_cost_vnd'),
  icon: text('icon'),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: text('archived_at'),
  updatedAt: text('updated_at').notNull(),
});

export const personalCategories = sqliteTable(
  'personal_categories',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references(
      (): import('drizzle-orm/sqlite-core').AnySQLiteColumn => personalCategories.id,
    ),
    type: text('type').notNull(),
    name: text('name').notNull(),
    icon: text('icon').notNull(),
    hidden: integer('hidden').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('personal_categories_user_idx').on(t.userId)],
);

export const personalTags = sqliteTable(
  'personal_tags',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('personal_tags_user_name_uq').on(t.userId, sql`lower(${t.name})`)],
);

export const personalTransactions = sqliteTable(
  'personal_transactions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    walletId: text('wallet_id')
      .notNull()
      .references(() => personalWallets.id),
    type: text('type').notNull(),
    amount: integer('amount').notNull(),
    categoryId: text('category_id').references(() => personalCategories.id),
    transferId: text('transfer_id'),
    assetId: text('asset_id'),
    quantity: integer('quantity'),
    date: text('date').notNull(),
    time: text('time'),
    note: text('note'),
    excludeFromReports: integer('exclude_from_reports').notNull().default(0),
    source: text('source').notNull().default('manual'),
    externalRef: text('external_ref'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    /** `personal_sync_state.version` of the write that last changed this row (0029). */
    syncVersion: integer('sync_version').notNull().default(0),
  },
  (t) => [
    index('personal_tx_user_date_idx').on(t.userId, t.date),
    index('personal_tx_user_sync_idx').on(t.userId, t.syncVersion, t.id),
    index('personal_tx_wallet_date_idx').on(t.walletId, t.date),
    index('personal_tx_transfer_idx').on(t.transferId),
    index('personal_tx_asset_idx').on(t.assetId),
    uniqueIndex('personal_tx_external_uq')
      .on(t.userId, t.source, t.externalRef)
      .where(sql`${t.externalRef} IS NOT NULL`),
    check(
      'personal_transactions_type_check',
      sql`${t.type} IN ('expense', 'income', 'transfer_out', 'transfer_in', 'buy', 'sell')`,
    ),
  ],
);

export const personalTransactionTags = sqliteTable(
  'personal_transaction_tags',
  {
    transactionId: text('transaction_id')
      .notNull()
      .references(() => personalTransactions.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => personalTags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.tagId] }),
    index('personal_tx_tags_tag_idx').on(t.tagId),
  ],
);

export const personalAssets = sqliteTable(
  'personal_assets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    unit: text('unit').notNull(),
    groupName: text('group_name').notNull(),
    decimals: integer('decimals').notNull(),
    hidden: integer('hidden').notNull().default(0),
    sortOrder: integer('sort_order').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('personal_assets_user_sort_idx').on(t.userId, t.sortOrder),
    uniqueIndex('personal_assets_user_name_uq').on(t.userId, sql`lower(${t.name})`),
    check('personal_assets_decimals_check', sql`${t.decimals} BETWEEN 0 AND 8`),
  ],
);

export const notificationLogs = sqliteTable(
  'notification_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    tripId: text('trip_id').references(() => trips.id),
    type: text('type', { enum: ['transaction_crud', 'loan_reminder', 'monthly_notice'] }).notNull(),
    referenceId: text('reference_id').notNull(),
    sentAt: text('sent_at').notNull(),
  },
  (t) => [
    index('notification_logs_user_trip_type_sent_idx').on(t.userId, t.tripId, t.type, t.sentAt),
  ],
);

/** One installed-app device subscribed to Web Push, with its own per-event switches. */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    newSession: integer('new_session').notNull().default(1),
    sessionReminder: integer('session_reminder').notNull().default(1),
    reminderLeadMinutes: integer('reminder_lead_minutes').notNull().default(30),
    expenseNew: integer('expense_new').notNull().default(1),
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastSuccessAt: text('last_success_at'),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);

/** Precomputed session reminders per device, so the cron reads only what is due. */
export const pushReminders = sqliteTable(
  'push_reminders',
  {
    id: text('id').primaryKey(),
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: 'cascade' }),
    transactionRootId: text('transaction_root_id').notNull(),
    tripId: text('trip_id').notNull(),
    dueAt: text('due_at').notNull(),
    sentAt: text('sent_at'),
  },
  (t) => [
    uniqueIndex('push_reminders_sub_root_uq').on(t.subscriptionId, t.transactionRootId),
    index('push_reminders_due_idx').on(t.sentAt, t.dueAt),
  ],
);

export const tripLocations = sqliteTable(
  'trip_locations',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id').notNull(),
    name: text('name').notNull(),
    address: text('address').notNull(),
    phone: text('phone'),
    mapUrl: text('map_url'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('trip_locations_trip_id_idx').on(t.tripId)],
);


/** Attendance reliability scores per group member (#87). Columns mirror `AttendanceScore` from `@cc/core`. */
export const attendanceScores = sqliteTable(
  'attendance_scores',
  {
    tripId: text('trip_id').notNull(),
    participantId: text('participant_id').notNull(),
    presence: real('presence').notNull(),
    reliability: real('reliability').notNull(),
    guest: real('guest').notNull(),
    presenceJoinStreak: integer('presence_join_streak').notNull().default(0),
    presenceSkipStreak: integer('presence_skip_streak').notNull().default(0),
    reliabilityJoinStreak: integer('reliability_join_streak').notNull().default(0),
    reliabilitySkipStreak: integer('reliability_skip_streak').notNull().default(0),
    sessionsSeen: integer('sessions_seen').notNull().default(0),
    sessionsPlanned: integer('sessions_planned').notNull().default(0),
    timesPlayed: integer('times_played').notNull().default(0),
    guestsTotal: integer('guests_total').notNull().default(0),
    lastPlayedOn: text('last_played_on'),
    lastSessionRoot: text('last_session_root'),
    lastBack: integer('last_back').notNull().default(0),
    lastReturnGap: integer('last_return_gap').notNull().default(0),
    lastEndedNoShowStreak: integer('last_ended_no_show_streak').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.participantId] })],
);

/** Session roots already folded into `attendance_scores`; a root is counted once. */
export const attendanceCounted = sqliteTable(
  'attendance_counted',
  {
    rootId: text('root_id').primaryKey(),
    tripId: text('trip_id').notNull(),
    countedAt: text('counted_at').notNull(),
  },
  (t) => [index('attendance_counted_trip_idx').on(t.tripId)],
);

/** Optimistic-lock version for a group's attendance bookkeeping (separate from `trips.version`). */
export const attendanceState = sqliteTable('attendance_state', {
  tripId: text('trip_id').primaryKey(),
  version: integer('version').notNull().default(0),
});

/** Per-user change counter for the browser's saved copy of /transactions (0029, #133). */
export const personalSyncState = sqliteTable('personal_sync_state', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(0),
  epoch: integer('epoch').notNull().default(0),
  purgedVersion: integer('purged_version').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});

/** Deleted personal transactions, kept 90 days so a sync can tell other browsers (0029, #133). */
export const personalSyncDeletions = sqliteTable(
  'personal_sync_deletions',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    transactionId: text('transaction_id').notNull(),
    version: integer('version').notNull(),
    deletedAt: text('deleted_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.transactionId] }),
    index('personal_sync_del_user_version_idx').on(t.userId, t.version),
    index('personal_sync_del_deleted_at_idx').on(t.deletedAt),
  ],
);
