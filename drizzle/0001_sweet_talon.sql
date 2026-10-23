CREATE TABLE `coaching_changes` (
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`action` text NOT NULL,
	`at` text NOT NULL,
	PRIMARY KEY(`user_id`, `revision`)
);
--> statement-breakpoint
CREATE TABLE `coaching_plans` (
	`user_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`created_at` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`user_id`, `plan_id`)
);
