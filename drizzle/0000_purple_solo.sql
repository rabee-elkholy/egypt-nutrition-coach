CREATE TABLE `coaching_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`body` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coaching_requests` (
	`user_id` text NOT NULL,
	`request_key` text NOT NULL,
	`digest` text NOT NULL,
	`response` text NOT NULL,
	PRIMARY KEY(`user_id`, `request_key`)
);
