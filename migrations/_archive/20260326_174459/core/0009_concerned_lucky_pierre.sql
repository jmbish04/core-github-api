CREATE TABLE `cloudflare_changelog` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`link` text NOT NULL,
	`description` text NOT NULL,
	`ai_summary` text,
	`pub_date` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL,
	`emailed` integer DEFAULT false NOT NULL
);
