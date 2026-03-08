CREATE TABLE IF NOT EXISTS `research_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`goal` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`cron_schedule` text,
	`github_terms` text,
	`discord_terms` text,
	`google_terms` text,
	`progress` integer DEFAULT 0,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	`updated_at` integer DEFAULT (strftime('%s', 'now'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `research_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`findings` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`project_id`) REFERENCES `research_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
