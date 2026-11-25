ALTER TABLE `personal_categories` ADD COLUMN `system_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_categories_user_system_key_idx` ON `personal_categories` (`user_id`, `system_key`);
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `category_key` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `note` text;
