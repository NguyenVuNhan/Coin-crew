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
--> statement-breakpoint
CREATE INDEX `activity_trip_id_idx` ON `activity` (`trip_id`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX `bank_details_participant_id_idx` ON `bank_details` (`participant_id`);--> statement-breakpoint
CREATE INDEX `bank_details_user_id_idx` ON `bank_details` (`user_id`);--> statement-breakpoint
CREATE TABLE `device_participants` (
	`device_hash` text NOT NULL,
	`trip_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`last_used_at` text NOT NULL,
	PRIMARY KEY(`device_hash`, `trip_id`)
);
--> statement-breakpoint
CREATE INDEX `device_participants_trip_id_idx` ON `device_participants` (`trip_id`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expense_shares` (
	`expense_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`input_value` integer NOT NULL,
	`amount` integer NOT NULL,
	PRIMARY KEY(`expense_id`, `participant_id`)
);
--> statement-breakpoint
CREATE INDEX `expense_shares_participant_id_idx` ON `expense_shares` (`participant_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'VND' NOT NULL,
	`spent_on` text NOT NULL,
	`payer_id` text NOT NULL,
	`split_mode` text NOT NULL,
	`status` text NOT NULL,
	`reject_reason` text,
	`disabled_by_user_id` text,
	`created_by_participant_id` text NOT NULL,
	`created_by_device` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `expenses_trip_id_idx` ON `expenses` (`trip_id`);--> statement-breakpoint
CREATE TABLE `membership_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `membership_requests_trip_id_idx` ON `membership_requests` (`trip_id`);--> statement-breakpoint
CREATE TABLE `ops_alerts` (
	`day` text NOT NULL,
	`metric` text NOT NULL,
	PRIMARY KEY(`day`, `metric`)
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`user_id` text,
	`status` text NOT NULL,
	`merged_into` text,
	`sort_order` integer NOT NULL,
	`created_by_device` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `participants_trip_id_idx` ON `participants` (`trip_id`);--> statement-breakpoint
CREATE INDEX `participants_trip_id_normalized_name_idx` ON `participants` (`trip_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `payment_refs` (
	`code` text NOT NULL,
	`trip_id` text NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_refs_trip_id_idx` ON `payment_refs` (`trip_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_refs_trip_id_code_uidx` ON `payment_refs` (`trip_id`,`code`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`amount_claimed` integer NOT NULL,
	`amount_confirmed` integer,
	`currency` text DEFAULT 'VND' NOT NULL,
	`status` text NOT NULL,
	`not_arrived_at` text,
	`recorded_by_participant_id` text NOT NULL,
	`recorded_by_device` text,
	`confirmed_by_participant_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payments_trip_id_idx` ON `payments` (`trip_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trip_views` (
	`trip_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'VND' NOT NULL,
	`fewest_transfers` integer DEFAULT 1 NOT NULL,
	`organiser_user_id` text NOT NULL,
	`group_token` text NOT NULL,
	`view_token` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trips_group_token_unique` ON `trips` (`group_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `trips_view_token_unique` ON `trips` (`view_token`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`google_sub` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`consent_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);