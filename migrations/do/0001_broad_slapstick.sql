CREATE TABLE `pr_manager_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`pull_number` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pr_manager_jobs_created_at` ON `pr_manager_jobs` (`created_at`);