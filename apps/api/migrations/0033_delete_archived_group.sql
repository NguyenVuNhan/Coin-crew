ALTER TABLE `trips` ADD COLUMN `delete_after` text;
--> statement-breakpoint
CREATE INDEX `trips_delete_after_idx` ON `trips` (`delete_after`) WHERE `delete_after` IS NOT NULL;
