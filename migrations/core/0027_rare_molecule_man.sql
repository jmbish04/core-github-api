CREATE TABLE `jules_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`repo_full_name` text NOT NULL,
	`prompt` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jules_jobs_status_idx` ON `jules_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `jules_jobs_session_id_idx` ON `jules_jobs` (`session_id`);--> statement-breakpoint
DROP TABLE `daily_trends`;