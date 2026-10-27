CREATE TABLE `users_new` (
  `id` text PRIMARY KEY NOT NULL,
  `google_sub` text,
  `zalo_sub` text,
  `email` text,
  `name` text NOT NULL,
  `gender` text,
  `avatar_url` text,
  `custom_profile` integer DEFAULT 0 NOT NULL,
  `consent_at` text,
  `created_at` text NOT NULL,
  CHECK (`google_sub` IS NOT NULL OR `zalo_sub` IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `users_new` (`id`, `google_sub`, `zalo_sub`, `email`, `name`, `gender`, `avatar_url`, `custom_profile`, `consent_at`, `created_at`)
SELECT `id`, `google_sub`, NULL, `email`, `name`, `gender`, `avatar_url`, `custom_profile`, `consent_at`, `created_at` FROM `users`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
ALTER TABLE `users_new` RENAME TO `users`;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`) WHERE `google_sub` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_zalo_sub_unique` ON `users` (`zalo_sub`) WHERE `zalo_sub` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `account_merge_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `survivor_user_id` text NOT NULL,
  `merged_user_id` text NOT NULL,
  `provider` text NOT NULL,
  `provider_sub` text NOT NULL,
  `status` text NOT NULL,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `decided_at` text
);
--> statement-breakpoint
CREATE INDEX `account_merge_requests_merged_idx` ON `account_merge_requests` (`merged_user_id`, `status`);
--> statement-breakpoint
CREATE INDEX `account_merge_requests_survivor_idx` ON `account_merge_requests` (`survivor_user_id`, `status`);
