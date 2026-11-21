ALTER TABLE `coaching_users` ADD COLUMN `avatar_url` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_oauth_identities` (
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text,
	`apple_refresh_token_enc` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`provider`, `subject`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_oauth_user` ON `coaching_oauth_identities` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_push_tokens` (
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`platform` text NOT NULL,
	`push_token` text NOT NULL,
	`locale` text NOT NULL,
	`timezone` text NOT NULL,
	`app_version` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `device_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `food_barcodes` (
	`barcode` text PRIMARY KEY NOT NULL,
	`name_ar` text,
	`name_en` text NOT NULL,
	`brand` text,
	`serving_size_grams` real NOT NULL,
	`serving_label` text,
	`values_per_100g_json` text NOT NULL,
	`provenance` text NOT NULL,
	`submitted_by_user_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_food_favorites` (
	`user_id` text NOT NULL,
	`favorite_id` text NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `favorite_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_grocery_checks` (
	`user_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`ingredient_key` text NOT NULL,
	`checked` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `plan_id`, `ingredient_key`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_body_measurements` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`body` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `date`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_progress_photos` (
	`user_id` text NOT NULL,
	`photo_id` text NOT NULL,
	`date` text NOT NULL,
	`pose` text NOT NULL,
	`r2_object_key` text NOT NULL,
	`weight_kg_snapshot` real,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `photo_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_photos_user_date` ON `coaching_progress_photos` (`user_id`, `date` DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_ai_messages` (
	`user_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`message_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`meta_json` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `thread_id`, `message_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_subscriptions` (
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_tx_id` text NOT NULL,
	`product_id` text NOT NULL,
	`status` text NOT NULL,
	`trial_used` integer DEFAULT 0 NOT NULL,
	`auto_renew_enabled` integer DEFAULT 1 NOT NULL,
	`expires_at` text NOT NULL,
	`raw_state_json` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`provider`, `external_tx_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_subs_user` ON `coaching_subscriptions` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_support_tickets` (
	`ticket_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`diagnostics_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_usage_quotas` (
	`user_id` text NOT NULL,
	`quota_key` text NOT NULL,
	`window_key` text NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `quota_key`, `window_key`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_activity_logs` (
	`user_id` text NOT NULL,
	`log_id` text NOT NULL,
	`date` text NOT NULL,
	`source` text NOT NULL,
	`external_record_id` text,
	`updated_at` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`user_id`, `log_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_activity_logs_user_date` ON `coaching_activity_logs` (`user_id`, `date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_streak_freezes` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `date`)
);
