CREATE TABLE `attendance_scores` (`trip_id` text NOT NULL, `participant_id` text NOT NULL, `presence` real NOT NULL, `reliability` real NOT NULL, `guest` real NOT NULL,
  `presence_join_streak` integer NOT NULL DEFAULT 0, `presence_skip_streak` integer NOT NULL DEFAULT 0, `reliability_join_streak` integer NOT NULL DEFAULT 0, `reliability_skip_streak` integer NOT NULL DEFAULT 0,
  `sessions_seen` integer NOT NULL DEFAULT 0, `sessions_planned` integer NOT NULL DEFAULT 0, `times_played` integer NOT NULL DEFAULT 0, `guests_total` integer NOT NULL DEFAULT 0,
  `last_played_on` text, `last_session_root` text, `last_back` integer NOT NULL DEFAULT 0, `last_return_gap` integer NOT NULL DEFAULT 0, `last_ended_no_show_streak` integer NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL, PRIMARY KEY (`trip_id`, `participant_id`));--> statement-breakpoint
CREATE TABLE `attendance_counted` (`root_id` text PRIMARY KEY NOT NULL, `trip_id` text NOT NULL, `counted_at` text NOT NULL);--> statement-breakpoint
CREATE INDEX `attendance_counted_trip_idx` ON `attendance_counted` (`trip_id`);--> statement-breakpoint
CREATE TABLE `attendance_state` (`trip_id` text PRIMARY KEY NOT NULL, `version` integer NOT NULL DEFAULT 0);
