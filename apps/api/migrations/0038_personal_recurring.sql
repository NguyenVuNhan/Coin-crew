-- Personal recurring rules and planned items tables (#117).
CREATE TABLE `personal_recurring_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `type` text NOT NULL CHECK (`type` IN ('expense', 'income', 'transfer', 'buy')),
  `draft` text NOT NULL,
  `schedule` text NOT NULL,
  `ask_me` integer NOT NULL DEFAULT 0,
  `status` text NOT NULL DEFAULT 'active' CHECK (`status` IN ('active', 'paused', 'ended')),
  `paused_reason` text,
  `next_due_on` text,
  `last_confirmed_on` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `personal_recurring_rules_due_idx` ON `personal_recurring_rules` (`status`, `next_due_on`);
--> statement-breakpoint
CREATE INDEX `personal_recurring_rules_user_idx` ON `personal_recurring_rules` (`user_id`);
--> statement-breakpoint
CREATE TABLE `personal_recurring_rule_tags` (
  `rule_id` text NOT NULL REFERENCES `personal_recurring_rules`(`id`) ON DELETE CASCADE,
  `tag_id` text NOT NULL REFERENCES `personal_tags`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`rule_id`, `tag_id`)
);
--> statement-breakpoint
CREATE TABLE `personal_planned_items` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `kind` text NOT NULL,
  `ref_key` text NOT NULL,
  `rule_id` text,
  `due_on` text NOT NULL,
  `draft` text,
  `meta` text,
  `status` text NOT NULL DEFAULT 'waiting' CHECK (`status` IN ('waiting', 'confirmed', 'skipped', 'dismissed')),
  `transaction_id` text,
  `created_on` text NOT NULL,
  `resolved_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_planned_items_ref_uq` ON `personal_planned_items` (`user_id`, `kind`, `ref_key`);
--> statement-breakpoint
CREATE INDEX `personal_planned_items_user_status_idx` ON `personal_planned_items` (`user_id`, `status`);
--> statement-breakpoint
CREATE INDEX `personal_planned_items_rule_status_idx` ON `personal_planned_items` (`rule_id`, `status`);
