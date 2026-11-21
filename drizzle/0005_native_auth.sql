CREATE TABLE IF NOT EXISTS `coaching_users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL UNIQUE,
	`password_hash` text NOT NULL,
	`display_name` text,
	`entitlement` text DEFAULT 'free' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_refresh_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`device_id` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`rotated_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_refresh_tokens_user_session` ON `coaching_refresh_tokens` (`user_id`, `session_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_refresh_tokens_expires` ON `coaching_refresh_tokens` (`expires_at`);
