CREATE TABLE `standardization_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`source_repo` text DEFAULT 'jmbish04/core-github-standardization' NOT NULL,
	`file_path` text NOT NULL,
	`description` text,
	`relevant_infra` text DEFAULT '[]' NOT NULL,
	`irrelevant_infra` text DEFAULT '[]' NOT NULL,
	`ai_instructions` text,
	`should_overwrite` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
