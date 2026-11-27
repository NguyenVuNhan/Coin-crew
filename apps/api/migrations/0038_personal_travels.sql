-- Personal travels tables (#158).
CREATE TABLE `personal_travels` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `tag_id` text NOT NULL REFERENCES `personal_tags`(`id`) ON DELETE CASCADE,
  `start_date` text NOT NULL,
  `end_date` text NOT NULL,
  `counts_from` text NOT NULL,
  `budget_id` text REFERENCES `personal_budgets`(`id`) ON DELETE SET NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `personal_travels_user_idx` ON `personal_travels` (`user_id`);
--> statement-breakpoint
CREATE TABLE `personal_travel_groups` (
  `travel_id` text NOT NULL REFERENCES `personal_travels`(`id`) ON DELETE CASCADE,
  `trip_id` text NOT NULL,
  PRIMARY KEY (`travel_id`, `trip_id`)
);
--> statement-breakpoint
CREATE TABLE `personal_travel_share_marks` (
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `root_id` text NOT NULL,
  `travel_id` text NOT NULL REFERENCES `personal_travels`(`id`) ON DELETE CASCADE,
  `state` text NOT NULL CHECK (`state` IN ('tagged', 'skipped')),
  PRIMARY KEY (`user_id`, `root_id`)
);
