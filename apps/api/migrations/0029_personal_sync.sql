-- Saved copy of /transactions in each browser (#133): a per-user change counter, a stamp on each
-- personal transaction, and records of deleted transactions so a sync can send only what changed.
CREATE TABLE `personal_sync_state` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `version` integer NOT NULL DEFAULT 0,
  `epoch` integer NOT NULL DEFAULT 0,
  `purged_version` integer NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `personal_sync_deletions` (
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `transaction_id` text NOT NULL,
  `version` integer NOT NULL,
  `deleted_at` text NOT NULL,
  PRIMARY KEY (`user_id`, `transaction_id`)
);
--> statement-breakpoint
CREATE INDEX `personal_sync_del_user_version_idx` ON `personal_sync_deletions` (`user_id`, `version`);
--> statement-breakpoint
CREATE INDEX `personal_sync_del_deleted_at_idx` ON `personal_sync_deletions` (`deleted_at`);
--> statement-breakpoint
ALTER TABLE `personal_transactions` ADD COLUMN `sync_version` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX `personal_tx_user_sync_idx` ON `personal_transactions` (`user_id`, `sync_version`, `id`);
