CREATE TABLE `research_recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`repo_name` text NOT NULL,
	`repo_url` text NOT NULL,
	`description` text,
	`stars` integer DEFAULT 0,
	`ai_score` real,
	`ai_reasoning` text,
	`human_rating` integer,
	`human_feedback` text,
	`is_reviewed` integer DEFAULT false,
	`created_at` integer DEFAULT (strftime('%s', 'now'))
);
