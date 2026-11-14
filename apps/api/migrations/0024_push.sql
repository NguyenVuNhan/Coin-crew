CREATE TABLE `push_subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `endpoint` text NOT NULL UNIQUE,
  `p256dh` text NOT NULL,
  `auth` text NOT NULL,
  `new_session` integer NOT NULL DEFAULT 1,
  `session_reminder` integer NOT NULL DEFAULT 1,
  `reminder_lead_minutes` integer NOT NULL DEFAULT 30,
  `expense_new` integer NOT NULL DEFAULT 1,
  `user_agent` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `last_success_at` text
);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);
--> statement-breakpoint
CREATE TABLE `push_reminders` (
  `id` text PRIMARY KEY NOT NULL,
  `subscription_id` text NOT NULL REFERENCES `push_subscriptions`(`id`) ON DELETE CASCADE,
  `transaction_root_id` text NOT NULL,
  `trip_id` text NOT NULL,
  `due_at` text NOT NULL,
  `sent_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_reminders_sub_root_uq` ON `push_reminders` (`subscription_id`, `transaction_root_id`);
--> statement-breakpoint
CREATE INDEX `push_reminders_due_idx` ON `push_reminders` (`sent_at`, `due_at`);
