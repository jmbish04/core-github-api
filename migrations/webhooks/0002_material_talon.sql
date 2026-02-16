CREATE TABLE `daily_trends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`trend_summary` text NOT NULL,
	`top_picks` text NOT NULL,
	`sent_in_email` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `daily_trends_date_idx` ON `daily_trends` (`date`);--> statement-breakpoint
CREATE TABLE `research_judge_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`query` text NOT NULL,
	`is_relevant` integer NOT NULL,
	`ai_features` text NOT NULL,
	`summary` text NOT NULL,
	`confidence_score` real NOT NULL,
	`created_at` text NOT NULL
);
