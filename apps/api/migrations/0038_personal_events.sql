-- Personal events tables (#158).
CREATE TABLE `personal_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `tag_id` text REFERENCES `personal_tags`(`id`) ON DELETE SET NULL,
  `start_date` text NOT NULL,
  `end_date` text,
  `planned_end` text,
  `stopped_at` text,
  `counts_from` text NOT NULL,
  `budget_id` text REFERENCES `personal_budgets`(`id`) ON DELETE SET NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `personal_events_user_idx` ON `personal_events` (`user_id`);
--> statement-breakpoint
CREATE TABLE `personal_event_groups` (
  `event_id` text NOT NULL REFERENCES `personal_events`(`id`) ON DELETE CASCADE,
  `trip_id` text NOT NULL,
  PRIMARY KEY (`event_id`, `trip_id`)
);
--> statement-breakpoint
CREATE TABLE `personal_event_share_marks` (
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `root_id` text NOT NULL,
  `event_id` text NOT NULL REFERENCES `personal_events`(`id`) ON DELETE CASCADE,
  `state` text NOT NULL CHECK (`state` IN ('tagged', 'skipped')),
  PRIMARY KEY (`user_id`, `root_id`, `event_id`)
);
