CREATE TABLE IF NOT EXISTS `golden_path_config` (
	`id` text PRIMARY KEY NOT NULL,
	`frontend` text NOT NULL,
	`backend` text NOT NULL,
	`ai` text NOT NULL,
	`infra` text NOT NULL,
	`docs` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
