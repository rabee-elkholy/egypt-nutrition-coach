CREATE TABLE `coaching_cases` (
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`date` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`user_id`, `case_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_cases_user_date` ON `coaching_cases` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `coaching_feedback` (
	`user_id` text NOT NULL,
	`feedback_id` text NOT NULL,
	`date` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`user_id`, `feedback_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_user_date` ON `coaching_feedback` (`user_id`,`date`);