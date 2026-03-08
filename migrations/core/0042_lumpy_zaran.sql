PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `daily_research_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`prompt` text NOT NULL,
	`status` text NOT NULL,
	`judge_notes` text,
	`findings` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now')) NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=ON;