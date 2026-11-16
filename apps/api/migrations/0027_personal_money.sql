CREATE TABLE `personal_wallet_settings` (
  `wallet_id` text PRIMARY KEY NOT NULL REFERENCES `personal_wallets`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `kind` text NOT NULL DEFAULT 'everyday',
  `start_cost_vnd` integer,
  `icon` text,
  `sort_order` integer NOT NULL DEFAULT 0,
  `archived_at` text,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `personal_categories` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `parent_id` text REFERENCES `personal_categories`(`id`),
  `type` text NOT NULL,
  `name` text NOT NULL,
  `icon` text NOT NULL,
  `hidden` integer NOT NULL DEFAULT 0,
  `sort_order` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `personal_categories_user_idx` ON `personal_categories` (`user_id`);
--> statement-breakpoint
CREATE TABLE `personal_tags` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_tags_user_name_uq` ON `personal_tags` (`user_id`, lower(`name`));
--> statement-breakpoint
CREATE TABLE `personal_transactions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `wallet_id` text NOT NULL REFERENCES `personal_wallets`(`id`),
  `type` text NOT NULL,
  `amount` integer NOT NULL,
  `category_id` text REFERENCES `personal_categories`(`id`),
  `transfer_id` text,
  `asset_id` text,
  `quantity` integer,
  `date` text NOT NULL,
  `time` text,
  `note` text,
  `exclude_from_reports` integer NOT NULL DEFAULT 0,
  `source` text NOT NULL DEFAULT 'manual',
  `external_ref` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CHECK (`type` IN ('expense', 'income', 'transfer_out', 'transfer_in', 'buy', 'sell'))
);
--> statement-breakpoint
CREATE INDEX `personal_tx_user_date_idx` ON `personal_transactions` (`user_id`, `date`);
--> statement-breakpoint
CREATE INDEX `personal_tx_wallet_date_idx` ON `personal_transactions` (`wallet_id`, `date`);
--> statement-breakpoint
CREATE INDEX `personal_tx_transfer_idx` ON `personal_transactions` (`transfer_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_tx_external_uq` ON `personal_transactions` (`user_id`, `source`, `external_ref`) WHERE `external_ref` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `personal_transaction_tags` (
  `transaction_id` text NOT NULL REFERENCES `personal_transactions`(`id`) ON DELETE CASCADE,
  `tag_id` text NOT NULL REFERENCES `personal_tags`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`transaction_id`, `tag_id`)
);
--> statement-breakpoint
CREATE INDEX `personal_tx_tags_tag_idx` ON `personal_transaction_tags` (`tag_id`);
