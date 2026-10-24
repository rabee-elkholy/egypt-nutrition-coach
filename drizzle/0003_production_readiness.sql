CREATE TABLE IF NOT EXISTS `coaching_food_entries` (
	`user_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`source` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`user_id`, `entry_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_food_entries_user_date` ON `coaching_food_entries` (`user_id`, `date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_water_logs` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`cups` integer NOT NULL,
	`liters` text NOT NULL,
	`updated_at` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`user_id`, `date`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_weight_logs` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`kg` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`updated_at` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`user_id`, `date`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_workout_logs` (
	`user_id` text NOT NULL,
	`log_id` text NOT NULL,
	`date` text NOT NULL,
	`exercise_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`user_id`, `log_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_workout_logs_user_date` ON `coaching_workout_logs` (`user_id`, `date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_sessions` (
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`date` text NOT NULL,
	`day_index` integer NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`user_id`, `session_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sessions_user_date` ON `coaching_sessions` (`user_id`, `date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_checkins` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`at` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`user_id`, `date`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_sync_outbox` (
	`user_id` text NOT NULL,
	`seq` integer NOT NULL,
	`revision` integer NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`op` text NOT NULL,
	`at` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`user_id`, `seq`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sync_outbox_user_rev` ON `coaching_sync_outbox` (`user_id`, `revision`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_auth_sessions` (
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`device_id` text,
	`created_at` text NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	PRIMARY KEY(`user_id`, `session_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `coaching_account_consents` (
	`user_id` text NOT NULL,
	`consent_type` text NOT NULL,
	`version` text NOT NULL,
	`accepted` integer NOT NULL,
	`at` text NOT NULL,
	PRIMARY KEY(`user_id`, `consent_type`)
);
