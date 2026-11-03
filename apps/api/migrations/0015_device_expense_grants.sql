CREATE TABLE `device_expense_grants` (
	`device_hash` text NOT NULL,
	`trip_id` text NOT NULL,
	`expense_root_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`device_hash`, `expense_root_id`)
);--> statement-breakpoint
CREATE INDEX `device_expense_grants_trip_idx` ON `device_expense_grants` (`trip_id`);
