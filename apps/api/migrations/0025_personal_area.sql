CREATE TABLE `user_personal_settings` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `enabled` integer NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL
);
