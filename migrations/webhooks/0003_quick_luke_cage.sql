CREATE TABLE `trending_repos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_uuid` text NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`ai_analysis` text,
	`why_justin_interested` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trending_repos_url_unique` ON `trending_repos` (`url`);--> statement-breakpoint
CREATE INDEX `trending_repos_url_idx` ON `trending_repos` (`url`);--> statement-breakpoint
CREATE INDEX `trending_repos_created_at_idx` ON `trending_repos` (`created_at`);