ALTER TABLE `users` ADD COLUMN `zalo_name` text;
--> statement-breakpoint
ALTER TABLE `account_merge_requests` ADD COLUMN `other_name` text;
--> statement-breakpoint
ALTER TABLE `account_merge_requests` ADD COLUMN `identity_label` text;
--> statement-breakpoint
ALTER TABLE `account_merge_requests` ADD COLUMN `dismissed_at` text;
