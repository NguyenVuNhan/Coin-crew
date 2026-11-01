ALTER TABLE `participants` ADD COLUMN `request_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `participants_request_token_unique` ON `participants` (`request_token`);--> statement-breakpoint
CREATE TABLE `person_links` (
  `owner_user_id` text NOT NULL,
  `participant_id` text NOT NULL,
  `person_pid` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY(`owner_user_id`, `participant_id`)
);--> statement-breakpoint
CREATE TABLE `nicknames` (
  `owner_user_id` text NOT NULL,
  `person_key` text NOT NULL,
  `nickname` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`owner_user_id`, `person_key`)
);--> statement-breakpoint
CREATE TABLE `participant_merges` (
  `id` text PRIMARY KEY NOT NULL,
  `trip_id` text NOT NULL,
  `from_id` text NOT NULL,
  `into_id` text NOT NULL,
  `actor_user_id` text NOT NULL,
  `created_at` text NOT NULL
);--> statement-breakpoint
CREATE TABLE `participant_merge_rows` (
  `merge_id` text NOT NULL,
  `table_name` text NOT NULL,
  `row_key` text NOT NULL,
  `before_json` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `participant_merge_rows_merge_id_idx` ON `participant_merge_rows` (`merge_id`);--> statement-breakpoint
UPDATE `membership_requests` SET `status` = 'rejected'
WHERE `status` = 'pending'
  AND EXISTS (
    SELECT 1 FROM `membership_requests` AS `older`
    WHERE `older`.`participant_id` = `membership_requests`.`participant_id`
      AND `older`.`status` = 'pending'
      AND (`older`.`created_at` < `membership_requests`.`created_at`
        OR (`older`.`created_at` = `membership_requests`.`created_at` AND `older`.`id` < `membership_requests`.`id`))
  );--> statement-breakpoint
CREATE UNIQUE INDEX `membership_requests_one_pending` ON `membership_requests` (`participant_id`) WHERE `status` = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `trips_organiser_direct_idx` ON `trips` (`organiser_user_id`) WHERE `preset` = 'direct';
