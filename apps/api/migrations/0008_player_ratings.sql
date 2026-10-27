ALTER TABLE `trips` ADD COLUMN `ratings_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE `player_ratings` (
  `trip_id` text NOT NULL,
  `rater_participant_id` text NOT NULL,
  `target_participant_id` text NOT NULL,
  `stars` integer NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY(`trip_id`, `rater_participant_id`, `target_participant_id`)
);--> statement-breakpoint
CREATE INDEX `player_ratings_trip_id_idx` ON `player_ratings` (`trip_id`);
