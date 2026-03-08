CREATE TABLE IF NOT EXISTS `research_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`filename` text NOT NULL,
	`filepath` text NOT NULL,
	`extension` text,
	`size_bytes` integer,
	`analysis` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `owner_repo_idx` ON `research_files` (`owner`,`repo`);--> statement-breakpoint
CREATE INDEX `filepath_idx` ON `research_files` (`filepath`);--> statement-breakpoint
CREATE INDEX `created_at_idx` ON `research_files` (`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `analysis_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`repo_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `research_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `repo_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`repo_id` text NOT NULL,
	`sample_score` real,
	`sample_reasoning` text,
	`code_quality` real,
	`modularity` real,
	`performance` real,
	`security` real,
	`analysis_summary` text,
	`final_score` real,
	`judge_reasoning` text,
	`strengths` text,
	`weaknesses` text,
	`recommendation` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `research_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `research_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`query` text,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`error_message` text
);
