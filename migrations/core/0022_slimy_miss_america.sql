CREATE TABLE `daily_research_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`prompt` text NOT NULL,
	`status` text NOT NULL,
	`judge_notes` text,
	`findings` text NOT NULL,
	`created_at` integer DEFAULT (datetime('now')) NOT NULL
);
