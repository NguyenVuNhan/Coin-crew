CREATE TABLE `personal_wallets` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `currency` text NOT NULL DEFAULT 'VND',
  `start_amount` integer NOT NULL,
  `start_date` text NOT NULL,
  `is_default` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `personal_wallets_user_idx` ON `personal_wallets` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_wallets_default_uq` ON `personal_wallets` (`user_id`) WHERE `is_default` = 1;
