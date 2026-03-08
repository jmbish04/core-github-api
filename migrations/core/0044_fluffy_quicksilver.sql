CREATE TABLE IF NOT EXISTS `pr_overviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`pr_number` integer NOT NULL,
	`ai_summary` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pr_overviews_lookup` ON `pr_overviews` (`repo_owner`,`repo_name`,`pr_number`);