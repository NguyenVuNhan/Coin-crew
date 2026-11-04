ALTER TABLE `account_merge_requests` ADD COLUMN `initiated_by` text NOT NULL DEFAULT 'survivor';
--> statement-breakpoint
ALTER TABLE `account_merge_requests` ADD COLUMN `claim_trip_id` text;
--> statement-breakpoint
ALTER TABLE `account_merge_requests` ADD COLUMN `claim_participant_id` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `claim_request_id` text;
--> statement-breakpoint
CREATE INDEX `account_merge_requests_claim_idx` ON `account_merge_requests` (`claim_trip_id`, `claim_participant_id`, `status`);
