CREATE TABLE `repo_sync_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`target_repo_pattern` text DEFAULT '*' NOT NULL,
	`trigger_events` text DEFAULT '["push", "pull_request"]' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
