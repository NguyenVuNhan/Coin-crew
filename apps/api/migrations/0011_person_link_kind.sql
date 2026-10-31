-- 'import': the link written when a group guest's own ledger row was created from them (a request
-- link, a settlement, a pick in the ledger). 'merge': a link the owner made with "Gộp với…".
-- Only merges can be undone.
ALTER TABLE `person_links` ADD COLUMN `kind` text NOT NULL DEFAULT 'merge';--> statement-breakpoint
-- Backfill: an import wrote the link and the ledger row in one batch, with the same timestamp and name.
UPDATE `person_links` SET `kind` = 'import'
WHERE EXISTS (
  SELECT 1 FROM `participants` `lt`
  JOIN `participants` `src` ON `src`.`id` = `person_links`.`participant_id`
  WHERE `lt`.`id` = `person_links`.`person_pid`
    AND `lt`.`created_at` = `person_links`.`created_at`
    AND `lt`.`name` = `src`.`name`
);
