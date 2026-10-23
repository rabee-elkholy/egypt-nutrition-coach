CREATE TABLE `coaching_workout_plans` (
	`user_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`user_id`, `plan_id`)
);
