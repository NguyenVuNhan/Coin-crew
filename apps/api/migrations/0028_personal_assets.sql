CREATE TABLE `personal_assets` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `unit` text NOT NULL,
  `group_name` text NOT NULL,
  `decimals` integer NOT NULL,
  `hidden` integer NOT NULL DEFAULT 0,
  `sort_order` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CHECK (`decimals` BETWEEN 0 AND 8)
);
--> statement-breakpoint
CREATE INDEX `personal_assets_user_sort_idx` ON `personal_assets` (`user_id`, `sort_order`);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_assets_user_name_uq` ON `personal_assets` (`user_id`, lower(`name`));
--> statement-breakpoint
CREATE INDEX `personal_tx_asset_idx` ON `personal_transactions` (`asset_id`);
