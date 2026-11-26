-- Personal budgets tables (#116).
CREATE TABLE `personal_budgets` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `target_kind` text NOT NULL CHECK (`target_kind` IN ('category', 'tag')),
  `target_id` text NOT NULL,
  `currency` text NOT NULL,
  `period_kind` text NOT NULL CHECK (`period_kind` IN ('week', 'month', 'year', 'once')),
  `month_start_day` integer,
  `from_date` text,
  `to_date` text,
  `suggestion_dismissed_until` text,
  `created_on` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `personal_budgets_user_idx` ON `personal_budgets` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_budgets_target_period_uq` ON `personal_budgets` (`user_id`, `target_kind`, `target_id`, `period_kind`, `currency`) WHERE `period_kind` <> 'once';
--> statement-breakpoint
CREATE TABLE `personal_budget_limits` (
  `budget_id` text NOT NULL REFERENCES `personal_budgets`(`id`) ON DELETE CASCADE,
  `effective_from` text NOT NULL,
  `amount` integer NOT NULL,
  PRIMARY KEY (`budget_id`, `effective_from`)
);
--> statement-breakpoint
CREATE TABLE `personal_budget_excluded_wallets` (
  `budget_id` text NOT NULL REFERENCES `personal_budgets`(`id`) ON DELETE CASCADE,
  `wallet_id` text NOT NULL REFERENCES `personal_wallets`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`budget_id`, `wallet_id`)
);
