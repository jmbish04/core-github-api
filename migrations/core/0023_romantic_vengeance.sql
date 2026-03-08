CREATE TABLE IF NOT EXISTS `jules_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`prompt` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`repo_owner` text,
	`repo_name` text,
	`branch` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	`assistance_count` integer DEFAULT 0,
	`requires_user_attention` integer DEFAULT false,
	`metadata_json` text
);
--> statement-breakpoint
CREATE INDEX `jules_status_idx` ON `jules_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `jules_project_idx` ON `jules_sessions` (`project_id`);--> statement-breakpoint
CREATE INDEX `jules_created_idx` ON `jules_sessions` (`created_at`);--> statement-breakpoint
CREATE INDEX `jules_last_activity_idx` ON `jules_sessions` (`last_activity_at`);--> statement-breakpoint
DROP INDEX `owner_repo_idx`;--> statement-breakpoint
DROP INDEX `filepath_idx`;--> statement-breakpoint
DROP INDEX `created_at_idx`;--> statement-breakpoint
CREATE INDEX `research_owner_repo_idx` ON `research_files` (`owner`,`repo`);--> statement-breakpoint
CREATE INDEX `research_filepath_idx` ON `research_files` (`filepath`);--> statement-breakpoint
CREATE INDEX `research_created_at_idx` ON `research_files` (`created_at`);