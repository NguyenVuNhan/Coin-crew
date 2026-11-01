-- Anonymous in-app feedback. No user, device, trip or IP column on purpose: `contact` is filled only
-- when the sender ticks "you can contact me". `created_at` is rounded down to the hour.
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text,
	`message` text NOT NULL,
	`screen` text NOT NULL,
	`device` text NOT NULL,
	`lang` text NOT NULL,
	`app_version` text NOT NULL,
	`contact` text,
	`created_at` text NOT NULL,
	`delivered_at` text
);
--> statement-breakpoint
CREATE INDEX `feedback_delivered_at_idx` ON `feedback` (`delivered_at`);--> statement-breakpoint
CREATE INDEX `feedback_created_at_idx` ON `feedback` (`created_at`);--> statement-breakpoint
-- Per-device feedback counts per hour, keyed by sha256(device hash + hour). Kept apart from
-- `feedback` so rows there carry no device link. The hourly cron deletes buckets older than a day.
CREATE TABLE `feedback_rate` (
	`key` text PRIMARY KEY NOT NULL,
	`bucket` text NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feedback_rate_bucket_idx` ON `feedback_rate` (`bucket`);
