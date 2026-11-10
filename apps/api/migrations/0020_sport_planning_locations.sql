CREATE TABLE `trip_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`phone` text,
	`map_url` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trip_locations_trip_id_idx` ON `trip_locations` (`trip_id`);
