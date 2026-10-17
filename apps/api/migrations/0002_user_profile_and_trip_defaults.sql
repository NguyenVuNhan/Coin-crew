ALTER TABLE users ADD COLUMN gender TEXT;--> statement-breakpoint
ALTER TABLE users ADD COLUMN avatar_url TEXT;--> statement-breakpoint
ALTER TABLE users ADD COLUMN custom_profile INTEGER NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE trips ADD COLUMN default_lang TEXT NOT NULL DEFAULT 'vi';
