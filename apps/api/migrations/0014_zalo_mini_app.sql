-- participants.zalo_sub ties a slot to a Zalo account (set only from server-verified IDs or by a
-- group admin); devices.zalo_sub is set only by POST /api/auth/zalo-mini from a verified token;
-- zalo_chat_links maps a Zalo group chat id to a group.
ALTER TABLE `participants` ADD COLUMN `zalo_sub` text;--> statement-breakpoint
CREATE UNIQUE INDEX `participants_trip_zalo_sub_unique` ON `participants` (`trip_id`, `zalo_sub`) WHERE `zalo_sub` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `zalo_chat_links` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`linked_by_user_id` text,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `zalo_chat_links_trip_id_idx` ON `zalo_chat_links` (`trip_id`);--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `zalo_sub` text;
