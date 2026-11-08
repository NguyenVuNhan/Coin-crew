CREATE TABLE `user_notification_settings` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`),
  `transaction_crud` integer NOT NULL DEFAULT 1,
  `loan_reminders` integer NOT NULL DEFAULT 1,
  `monthly_notice` integer NOT NULL DEFAULT 1,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `trip_id` text REFERENCES `trips`(`id`),
  `type` text NOT NULL,
  `reference_id` text NOT NULL,
  `sent_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_logs_user_trip_type_sent_idx` ON `notification_logs` (`user_id`, `trip_id`, `type`, `sent_at`);
