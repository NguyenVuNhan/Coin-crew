-- Balance caching tables and set-based SQL backfills (#109).
CREATE TABLE `personal_asset_counts` (
  `asset_id` text PRIMARY KEY NOT NULL REFERENCES `personal_assets`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `entry_count` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `personal_asset_counts_user_idx` ON `personal_asset_counts` (`user_id`);
--> statement-breakpoint
CREATE TABLE `personal_wallet_balances` (
  `wallet_id` text PRIMARY KEY NOT NULL REFERENCES `personal_wallets`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `personal_net` integer NOT NULL DEFAULT 0,
  `entry_count` integer NOT NULL DEFAULT 0,
  `vnd_value` integer,
  `cash_vnd` integer,
  `holdings_json` text,
  `needs_replay` integer NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `personal_wallet_balances_user_idx` ON `personal_wallet_balances` (`user_id`);
--> statement-breakpoint
CREATE TABLE `personal_trip_cache` (
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `trip_id` text NOT NULL,
  `trip_version` integer NOT NULL,
  `links_version` integer NOT NULL,
  `wallet_deltas_json` text NOT NULL,
  `rows_json` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`user_id`, `trip_id`)
);
--> statement-breakpoint
CREATE INDEX `personal_trip_cache_trip_idx` ON `personal_trip_cache` (`trip_id`);
--> statement-breakpoint
CREATE TABLE `trip_balance_cache` (
  `trip_id` text PRIMARY KEY NOT NULL,
  `trip_version` integer NOT NULL,
  `balances_json` text NOT NULL,
  `rounded_balances_json` text NOT NULL,
  `suggestions_json` text NOT NULL,
  `waiting_json` text NOT NULL,
  `oldest_shared_json` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `personal_wallet_balances` (
  `wallet_id`,
  `user_id`,
  `personal_net`,
  `entry_count`,
  `vnd_value`,
  `cash_vnd`,
  `holdings_json`,
  `needs_replay`,
  `updated_at`
)
SELECT
  pw.`id`,
  pw.`user_id`,
  COALESCE(tx.`personal_net`, 0),
  COALESCE(tx.`entry_count`, 0),
  NULL,
  NULL,
  NULL,
  CASE
    WHEN pw.`currency` <> 'VND' OR COALESCE(pws.`kind`, 'everyday') = 'investment' THEN 1
    ELSE 0
  END,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `personal_wallets` AS pw
LEFT JOIN `personal_wallet_settings` AS pws
  ON pws.`wallet_id` = pw.`id`
LEFT JOIN (
  SELECT
    `wallet_id`,
    SUM(CASE WHEN `type` IN ('income', 'transfer_in', 'sell') THEN `amount` ELSE -`amount` END) AS `personal_net`,
    COUNT(*) AS `entry_count`
  FROM `personal_transactions`
  GROUP BY `wallet_id`
) AS tx
  ON tx.`wallet_id` = pw.`id`;
--> statement-breakpoint
INSERT OR IGNORE INTO `personal_asset_counts` (`asset_id`, `user_id`, `entry_count`)
SELECT
  pa.`id`,
  pa.`user_id`,
  COALESCE(COUNT(pt.`id`), 0)
FROM `personal_assets` AS pa
LEFT JOIN `personal_transactions` AS pt
  ON pt.`asset_id` = pa.`id`
 AND pt.`user_id` = pa.`user_id`
GROUP BY pa.`id`, pa.`user_id`;
--> statement-breakpoint
CREATE TRIGGER `personal_tx_balance_ai`
AFTER INSERT ON `personal_transactions`
BEGIN
  INSERT INTO `personal_wallet_balances` (
    `wallet_id`,
    `user_id`,
    `personal_net`,
    `entry_count`,
    `needs_replay`,
    `updated_at`
  )
  VALUES (
    NEW.`wallet_id`,
    NEW.`user_id`,
    CASE WHEN NEW.`type` IN ('income', 'transfer_in', 'sell') THEN NEW.`amount` ELSE -NEW.`amount` END,
    1,
    0,
    NEW.`updated_at`
  )
  ON CONFLICT(`wallet_id`) DO UPDATE SET
    `personal_net` = `personal_net` + excluded.`personal_net`,
    `entry_count` = `entry_count` + 1,
    `updated_at` = excluded.`updated_at`;
END;
--> statement-breakpoint
CREATE TRIGGER `personal_tx_balance_au`
AFTER UPDATE OF `wallet_id`, `type`, `amount` ON `personal_transactions`
BEGIN
  UPDATE `personal_wallet_balances`
  SET
    `personal_net` = `personal_net` - (CASE WHEN OLD.`type` IN ('income', 'transfer_in', 'sell') THEN OLD.`amount` ELSE -OLD.`amount` END),
    `entry_count` = `entry_count` - 1,
    `updated_at` = NEW.`updated_at`
  WHERE `wallet_id` = OLD.`wallet_id`;
  INSERT INTO `personal_wallet_balances` (
    `wallet_id`,
    `user_id`,
    `personal_net`,
    `entry_count`,
    `needs_replay`,
    `updated_at`
  )
  VALUES (
    NEW.`wallet_id`,
    NEW.`user_id`,
    CASE WHEN NEW.`type` IN ('income', 'transfer_in', 'sell') THEN NEW.`amount` ELSE -NEW.`amount` END,
    1,
    0,
    NEW.`updated_at`
  )
  ON CONFLICT(`wallet_id`) DO UPDATE SET
    `personal_net` = `personal_net` + excluded.`personal_net`,
    `entry_count` = `entry_count` + 1,
    `updated_at` = excluded.`updated_at`;
END;
--> statement-breakpoint
CREATE TRIGGER `personal_tx_balance_ad`
AFTER DELETE ON `personal_transactions`
BEGIN
  UPDATE `personal_wallet_balances`
  SET
    `personal_net` = `personal_net` - (CASE WHEN OLD.`type` IN ('income', 'transfer_in', 'sell') THEN OLD.`amount` ELSE -OLD.`amount` END),
    `entry_count` = `entry_count` - 1
  WHERE `wallet_id` = OLD.`wallet_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_personal_trip_cache_ai`
AFTER INSERT ON `transactions`
BEGIN
  DELETE FROM `personal_trip_cache` WHERE `trip_id` = NEW.`trip_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_personal_trip_cache_au`
AFTER UPDATE ON `transactions`
BEGIN
  DELETE FROM `personal_trip_cache` WHERE `trip_id` = NEW.`trip_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `transactions_personal_trip_cache_ad`
AFTER DELETE ON `transactions`
BEGIN
  DELETE FROM `personal_trip_cache` WHERE `trip_id` = OLD.`trip_id`;
END;
