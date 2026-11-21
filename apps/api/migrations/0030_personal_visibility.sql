CREATE TABLE `personal_category_visibility` (
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `wallet_id` text NOT NULL REFERENCES `personal_wallets`(`id`) ON DELETE CASCADE,
  `category_id` text NOT NULL REFERENCES `personal_categories`(`id`) ON DELETE CASCADE,
  `visible` integer NOT NULL,
  PRIMARY KEY (`wallet_id`, `category_id`),
  CHECK (`visible` IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `personal_cat_vis_user_idx` ON `personal_category_visibility` (`user_id`);
--> statement-breakpoint
CREATE TABLE `personal_asset_visibility` (
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `wallet_id` text NOT NULL REFERENCES `personal_wallets`(`id`) ON DELETE CASCADE,
  `asset_id` text NOT NULL REFERENCES `personal_assets`(`id`) ON DELETE CASCADE,
  `visible` integer NOT NULL,
  PRIMARY KEY (`wallet_id`, `asset_id`),
  CHECK (`visible` IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `personal_asset_vis_user_idx` ON `personal_asset_visibility` (`user_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `personal_categories` (`id`, `user_id`, `parent_id`, `type`, `name`, `icon`, `hidden`, `sort_order`, `created_at`, `updated_at`)
SELECT
  u.`user_id` || ':fees',
  u.`user_id`,
  NULL,
  'expense',
  'Phí & lệ phí',
  'receipt-text',
  0,
  COALESCE(
    (SELECT `sort_order` FROM `personal_categories` WHERE `id` = u.`user_id` || ':tax'),
    (SELECT `sort_order` FROM `personal_categories` WHERE `id` = u.`user_id` || ':fee'),
    6
  ),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM (
  SELECT DISTINCT `user_id`
  FROM `personal_categories`
  WHERE `id` = `user_id` || ':tax' OR `id` = `user_id` || ':fee'
) u;
--> statement-breakpoint
UPDATE `personal_categories`
SET
  `parent_id` = `user_id` || ':fees',
  `sort_order` = CASE WHEN `id` = `user_id` || ':tax' THEN 0 ELSE 1 END,
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE (`id` = `user_id` || ':tax' OR `id` = `user_id` || ':fee')
  AND `parent_id` IS NULL
  AND EXISTS (
    SELECT 1 FROM `personal_categories` p
    WHERE p.`id` = `personal_categories`.`user_id` || ':fees'
  );
--> statement-breakpoint
INSERT OR IGNORE INTO `personal_categories` (`id`, `user_id`, `parent_id`, `type`, `name`, `icon`, `hidden`, `sort_order`, `created_at`, `updated_at`)
SELECT
  `user_id` || ':other-income-reward',
  `user_id`,
  `user_id` || ':other-income',
  'income',
  'Thưởng / Staking',
  'gift',
  0,
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM `personal_categories`
WHERE `id` = `user_id` || ':other-income';
--> statement-breakpoint
UPDATE `personal_sync_state`
SET
  `version` = `version` + 1,
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE `user_id` IN (
  SELECT DISTINCT `user_id`
  FROM `personal_categories`
  WHERE `id` IN (
    `user_id` || ':fees',
    `user_id` || ':tax',
    `user_id` || ':fee',
    `user_id` || ':other-income-reward'
  )
);
