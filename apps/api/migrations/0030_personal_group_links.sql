CREATE TABLE `personal_group_links` (
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `root_id` text NOT NULL,
  `trip_id` text NOT NULL,
  `wallet_id` text REFERENCES `personal_wallets`(`id`),
  `category_id` text REFERENCES `personal_categories`(`id`),
  `intent` text,
  `exclude_from_reports` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `sync_version` integer NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`, `root_id`),
  CHECK (`intent` IS NULL OR `intent` IN ('shared', 'loan'))
);
--> statement-breakpoint
CREATE INDEX `personal_group_links_user_trip_idx` ON `personal_group_links` (`user_id`, `trip_id`);
--> statement-breakpoint
CREATE TABLE `personal_group_link_tags` (
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `root_id` text NOT NULL,
  `tag_id` text NOT NULL REFERENCES `personal_tags`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`user_id`, `root_id`, `tag_id`)
);
--> statement-breakpoint
CREATE INDEX `personal_group_link_tags_tag_idx` ON `personal_group_link_tags` (`tag_id`);
--> statement-breakpoint
CREATE TABLE `personal_group_settings` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `default_group_category_id` text,
  `count_loans` integer NOT NULL DEFAULT 0,
  `disabled_at` text,
  `reenabled_at` text,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `personal_balance_checks` (
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `wallet_id` text NOT NULL REFERENCES `personal_wallets`(`id`) ON DELETE CASCADE,
  `answered_at` text NOT NULL,
  PRIMARY KEY (`user_id`, `wallet_id`)
);
