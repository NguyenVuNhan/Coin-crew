DELETE FROM `payment_refs`
WHERE rowid NOT IN (
  SELECT `rid` FROM (
    SELECT rowid AS `rid`,
      ROW_NUMBER() OVER (PARTITION BY `trip_id`, `from_id`, `to_id` ORDER BY `created_at`, `code`) AS `rn`
    FROM `payment_refs`
  )
  WHERE `rn` = 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_refs_trip_pair_uidx` ON `payment_refs` (`trip_id`, `from_id`, `to_id`);--> statement-breakpoint
CREATE TABLE `payment_keys` (
  `key` text PRIMARY KEY NOT NULL,
  `trip_id` text NOT NULL,
  `payment_id` text NOT NULL,
  `created_at` text NOT NULL
);
