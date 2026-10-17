ALTER TABLE `participants` ADD COLUMN `is_admin` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `participants` SET `is_admin` = 1 WHERE `user_id` = (SELECT `organiser_user_id` FROM `trips` WHERE `trips`.`id` = `participants`.`trip_id`);
