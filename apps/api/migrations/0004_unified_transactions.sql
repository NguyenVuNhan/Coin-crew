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
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transaction_shares` (
	`transaction_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`input_value` integer NOT NULL,
	`amount` integer NOT NULL,
	PRIMARY KEY(`transaction_id`, `participant_id`)
);
--> statement-breakpoint
INSERT INTO `transactions` (
	`id`, `root_id`, `parent_id`, `is_latest`, `trip_id`, `type`,
	`description`, `amount`, `amount_confirmed`, `currency`, `spent_on`,
	`payer_id`, `to_id`, `split_mode`, `status`, `reject_reason`, `not_arrived_at`,
	`disabled_by_user_id`, `created_by_participant_id`, `created_by_device`,
	`confirmed_by_participant_id`, `meta_json`, `created_at`, `updated_at`
)
SELECT
	`id`, `id`, NULL, 1, `trip_id`, 'expense',
	`description`, `amount`, NULL, `currency`, `spent_on`,
	`payer_id`, NULL, `split_mode`, `status`, `reject_reason`, NULL,
	`disabled_by_user_id`, `created_by_participant_id`, `created_by_device`,
	NULL, `meta_json`, `created_at`, `updated_at`
FROM `expenses`;
--> statement-breakpoint
INSERT INTO `transaction_shares` (`transaction_id`, `participant_id`, `input_value`, `amount`)
SELECT `expense_id`, `participant_id`, `input_value`, `amount`
FROM `expense_shares`;
--> statement-breakpoint
INSERT INTO `transactions` (
	`id`, `root_id`, `parent_id`, `is_latest`, `trip_id`, `type`,
	`description`, `amount`, `amount_confirmed`, `currency`, `spent_on`,
	`payer_id`, `to_id`, `split_mode`, `status`, `reject_reason`, `not_arrived_at`,
	`disabled_by_user_id`, `created_by_participant_id`, `created_by_device`,
	`confirmed_by_participant_id`, `meta_json`, `created_at`, `updated_at`
)
SELECT
	`id`, `id`, NULL, 1, `trip_id`, 'payment',
	'', `amount_claimed`, `amount_confirmed`, `currency`, substr(`created_at`, 1, 10),
	`from_id`, `to_id`, 'equal', `status`, NULL, `not_arrived_at`,
	NULL, `recorded_by_participant_id`, `recorded_by_device`,
	`confirmed_by_participant_id`, NULL, `created_at`, `updated_at`
FROM `payments`;
--> statement-breakpoint
INSERT INTO `transaction_shares` (`transaction_id`, `participant_id`, `input_value`, `amount`)
SELECT
	`id`, `to_id`, `amount_claimed`, COALESCE(`amount_confirmed`, `amount_claimed`)
FROM `payments`;
--> statement-breakpoint
DROP TABLE `expense_shares`;
--> statement-breakpoint
DROP TABLE `expenses`;
--> statement-breakpoint
DROP TABLE `payments`;
--> statement-breakpoint
CREATE INDEX `transactions_trip_type_latest_idx` ON `transactions` (`trip_id`, `type`, `is_latest`);
--> statement-breakpoint
CREATE INDEX `transactions_root_idx` ON `transactions` (`root_id`);
--> statement-breakpoint
CREATE INDEX `transaction_shares_participant_idx` ON `transaction_shares` (`participant_id`);
