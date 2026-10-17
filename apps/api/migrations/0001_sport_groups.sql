ALTER TABLE `trips` ADD COLUMN `preset` text DEFAULT 'trip' NOT NULL;--> statement-breakpoint
ALTER TABLE `participants` ADD COLUMN `gender` text;--> statement-breakpoint
ALTER TABLE `expenses` ADD COLUMN `meta_json` text;
