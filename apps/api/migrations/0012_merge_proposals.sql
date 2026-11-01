-- "This guest is that person": a merge asked for on someone else's behalf. It waits for the target
-- user and/or a group admin. At most one pending proposal per guest; the API also refuses one while
-- a membership claim is pending on the guest (and the other way round).
CREATE TABLE `merge_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`guest_pid` text NOT NULL,
	`into_pid` text,
	`target_user_id` text,
	`requested_by_user_id` text NOT NULL,
	`needs_user` integer DEFAULT 0 NOT NULL,
	`needs_admin` integer DEFAULT 0 NOT NULL,
	`user_accepted_at` text,
	`admin_accepted_at` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text
);
--> statement-breakpoint
CREATE INDEX `merge_proposals_trip_id_idx` ON `merge_proposals` (`trip_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `merge_proposals_one_pending` ON `merge_proposals` (`guest_pid`) WHERE `status` = 'pending';
