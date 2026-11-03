CREATE TABLE `account_merge_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`survivor_user_id` text NOT NULL,
	`merged_user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_sub` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`decided_at` text,
	`other_name` text,
	`identity_label` text,
	`dismissed_at` text,
	`initiated_by` text DEFAULT 'survivor' NOT NULL,
	`claim_trip_id` text,
	`claim_participant_id` text
);

CREATE INDEX `account_merge_requests_merged_idx` ON `account_merge_requests` (`merged_user_id`,`status`);
CREATE INDEX `account_merge_requests_survivor_idx` ON `account_merge_requests` (`survivor_user_id`,`status`);
CREATE INDEX `account_merge_requests_claim_idx` ON `account_merge_requests` (`claim_trip_id`,`claim_participant_id`,`status`);
CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`actor_participant_id` text,
	`actor_user_id` text,
	`actor_device` text,
	`action` text NOT NULL,
	`details_json` text NOT NULL,
	`created_at` text NOT NULL
);

CREATE INDEX `activity_trip_id_idx` ON `activity` (`trip_id`);
CREATE TABLE `bank_details` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`participant_id` text,
	`bin` text NOT NULL,
	`account_number` text NOT NULL,
	`holder_name` text NOT NULL,
	`status` text NOT NULL,
	`approved_by_user_id` text,
	`consent_at` text NOT NULL,
	`created_at` text NOT NULL
);

CREATE INDEX `bank_details_participant_id_idx` ON `bank_details` (`participant_id`);
CREATE INDEX `bank_details_user_id_idx` ON `bank_details` (`user_id`);
CREATE TABLE `device_expense_grants` (
	`device_hash` text NOT NULL,
	`trip_id` text NOT NULL,
	`expense_root_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`device_hash`, `expense_root_id`)
);

CREATE INDEX `device_expense_grants_trip_idx` ON `device_expense_grants` (`trip_id`);
CREATE TABLE `device_participants` (
	`device_hash` text NOT NULL,
	`trip_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`last_used_at` text NOT NULL,
	PRIMARY KEY(`device_hash`, `trip_id`)
);

CREATE INDEX `device_participants_trip_id_idx` ON `device_participants` (`trip_id`);
CREATE TABLE `devices` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`zalo_sub` text,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);

CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text,
	`message` text NOT NULL,
	`screen` text NOT NULL,
	`device` text NOT NULL,
	`lang` text NOT NULL,
	`app_version` text NOT NULL,
	`contact` text,
	`created_at` text NOT NULL,
	`delivered_at` text
);

CREATE INDEX `feedback_delivered_at_idx` ON `feedback` (`delivered_at`);
CREATE INDEX `feedback_created_at_idx` ON `feedback` (`created_at`);
CREATE TABLE `feedback_rate` (
	`key` text PRIMARY KEY NOT NULL,
	`bucket` text NOT NULL,
	`count` integer NOT NULL
);

CREATE INDEX `feedback_rate_bucket_idx` ON `feedback_rate` (`bucket`);
CREATE TABLE `membership_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);

CREATE INDEX `membership_requests_trip_id_idx` ON `membership_requests` (`trip_id`);
CREATE UNIQUE INDEX `membership_requests_one_pending` ON `membership_requests` (`participant_id`) WHERE "membership_requests"."status" = 'pending';
CREATE TABLE `merge_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`guest_pid` text NOT NULL,
	`into_pid` text,
	`target_user_id` text,
	`requested_by_user_id` text NOT NULL,
	`needs_user` integer DEFAULT 0 NOT NULL,
	`needs_admin` integer DEFAULT 0 NOT NULL,
	`user_accepted_at` text,
	`admin_accepted_at` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text
);

CREATE INDEX `merge_proposals_trip_id_idx` ON `merge_proposals` (`trip_id`);
CREATE UNIQUE INDEX `merge_proposals_one_pending` ON `merge_proposals` (`guest_pid`) WHERE "merge_proposals"."status" = 'pending';
CREATE TABLE `nicknames` (
	`owner_user_id` text NOT NULL,
	`person_key` text NOT NULL,
	`nickname` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_user_id`, `person_key`)
);

CREATE TABLE `ops_alerts` (
	`day` text NOT NULL,
	`metric` text NOT NULL,
	PRIMARY KEY(`day`, `metric`)
);

CREATE TABLE `participant_merge_rows` (
	`merge_id` text NOT NULL,
	`table_name` text NOT NULL,
	`row_key` text NOT NULL,
	`before_json` text NOT NULL
);

CREATE INDEX `participant_merge_rows_merge_id_idx` ON `participant_merge_rows` (`merge_id`);
CREATE TABLE `participant_merges` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`from_id` text NOT NULL,
	`into_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`created_at` text NOT NULL
);

CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`gender` text,
	`user_id` text,
	`zalo_sub` text,
	`is_admin` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`merged_into` text,
	`sort_order` integer NOT NULL,
	`created_by_device` text,
	`created_at` text NOT NULL,
	`request_token` text
);

CREATE UNIQUE INDEX `participants_request_token_unique` ON `participants` (`request_token`);
CREATE UNIQUE INDEX `participants_trip_zalo_sub_unique` ON `participants` (`trip_id`,`zalo_sub`) WHERE "participants"."zalo_sub" IS NOT NULL;
CREATE INDEX `participants_trip_id_idx` ON `participants` (`trip_id`);
CREATE INDEX `participants_trip_id_normalized_name_idx` ON `participants` (`trip_id`,`normalized_name`);
CREATE TABLE `payment_refs` (
	`code` text NOT NULL,
	`trip_id` text NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`created_at` text NOT NULL
);

CREATE INDEX `payment_refs_trip_id_idx` ON `payment_refs` (`trip_id`);
CREATE UNIQUE INDEX `payment_refs_trip_id_code_uidx` ON `payment_refs` (`trip_id`,`code`);
CREATE TABLE `person_links` (
	`owner_user_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`person_pid` text NOT NULL,
	`kind` text DEFAULT 'merge' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner_user_id`, `participant_id`)
);

CREATE TABLE `player_ratings` (
	`trip_id` text NOT NULL,
	`rater_participant_id` text NOT NULL,
	`target_participant_id` text NOT NULL,
	`stars` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`trip_id`, `rater_participant_id`, `target_participant_id`)
);

CREATE INDEX `player_ratings_trip_id_idx` ON `player_ratings` (`trip_id`);
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL
);

CREATE TABLE `settlement_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`settlement_id` text NOT NULL,
	`created_at` text NOT NULL
);

CREATE TABLE `transaction_shares` (
	`transaction_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`input_value` integer NOT NULL,
	`input_auto` integer DEFAULT 0 NOT NULL,
	`amount` integer NOT NULL,
	PRIMARY KEY(`transaction_id`, `participant_id`)
);

CREATE INDEX `transaction_shares_participant_idx` ON `transaction_shares` (`participant_id`);
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`root_id` text NOT NULL,
	`parent_id` text,
	`is_latest` integer DEFAULT 1 NOT NULL,
	`trip_id` text NOT NULL,
	`type` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`amount` integer NOT NULL,
	`amount_confirmed` integer,
	`currency` text DEFAULT 'VND' NOT NULL,
	`spent_on` text NOT NULL,
	`payer_id` text NOT NULL,
	`to_id` text,
	`split_mode` text DEFAULT 'equal' NOT NULL,
	`status` text NOT NULL,
	`reject_reason` text,
	`not_arrived_at` text,
	`disabled_by_user_id` text,
	`created_by_participant_id` text NOT NULL,
	`created_by_device` text,
	`confirmed_by_participant_id` text,
	`meta_json` text,
	`claim_request_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);

CREATE INDEX `transactions_trip_type_latest_idx` ON `transactions` (`trip_id`,`type`,`is_latest`);
CREATE INDEX `transactions_root_idx` ON `transactions` (`root_id`);
CREATE TABLE `trip_views` (
	`trip_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`json` text NOT NULL,
	`updated_at` text NOT NULL
);

CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`preset` text DEFAULT 'trip' NOT NULL,
	`currency` text DEFAULT 'VND' NOT NULL,
	`fewest_transfers` integer DEFAULT 0 NOT NULL,
	`round_transfers` integer DEFAULT 0 NOT NULL,
	`ratings_enabled` integer DEFAULT 0 NOT NULL,
	`default_lang` text DEFAULT 'vi' NOT NULL,
	`organiser_user_id` text NOT NULL,
	`group_token` text NOT NULL,
	`view_token` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`archived_at` text
);

CREATE UNIQUE INDEX `trips_group_token_unique` ON `trips` (`group_token`);
CREATE UNIQUE INDEX `trips_view_token_unique` ON `trips` (`view_token`);
CREATE UNIQUE INDEX `trips_organiser_direct_idx` ON `trips` (`organiser_user_id`) WHERE "trips"."preset" = 'direct';
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`google_sub` text,
	`zalo_sub` text,
	`zalo_name` text,
	`email` text,
	`name` text NOT NULL,
	`gender` text,
	`avatar_url` text,
	`custom_profile` integer DEFAULT 0 NOT NULL,
	`consent_at` text,
	`created_at` text NOT NULL,
	CONSTRAINT "users_identity_check" CHECK("users"."google_sub" IS NOT NULL OR "users"."zalo_sub" IS NOT NULL)
);

CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`) WHERE "users"."google_sub" IS NOT NULL;
CREATE UNIQUE INDEX `users_zalo_sub_unique` ON `users` (`zalo_sub`) WHERE "users"."zalo_sub" IS NOT NULL;
CREATE TABLE `zalo_chat_links` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`linked_by_user_id` text,
	`created_at` text NOT NULL
);

CREATE INDEX `zalo_chat_links_trip_id_idx` ON `zalo_chat_links` (`trip_id`);
