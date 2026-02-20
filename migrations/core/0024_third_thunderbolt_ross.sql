CREATE TABLE `daily_trends` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`sent_in_email` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `daily_trends_date_idx` ON `daily_trends` (`date`);--> statement-breakpoint
CREATE TABLE `research_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`title` text NOT NULL,
	`raw_brief_content` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `research_briefs_user_id_idx` ON `research_briefs` (`user_id`);--> statement-breakpoint
CREATE INDEX `research_briefs_status_idx` ON `research_briefs` (`status`);--> statement-breakpoint
CREATE TABLE `research_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`brief_id` text NOT NULL,
	`source_url` text NOT NULL,
	`source_type` text NOT NULL,
	`initial_summary` text,
	`judge_score` integer,
	`judge_reasoning` text,
	`user_rating` text DEFAULT 'pending',
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`brief_id`) REFERENCES `research_briefs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `research_candidates_brief_id_idx` ON `research_candidates` (`brief_id`);--> statement-breakpoint
CREATE INDEX `research_candidates_source_url_idx` ON `research_candidates` (`source_url`);--> statement-breakpoint
CREATE TABLE `research_execution_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`brief_id` text,
	`run_id` text,
	`agent_name` text NOT NULL,
	`step_name` text NOT NULL,
	`log_level` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`brief_id`) REFERENCES `research_briefs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `research_execution_logs_brief_id_idx` ON `research_execution_logs` (`brief_id`);--> statement-breakpoint
CREATE INDEX `research_execution_logs_run_id_idx` ON `research_execution_logs` (`run_id`);--> statement-breakpoint
CREATE INDEX `research_execution_logs_created_at_idx` ON `research_execution_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `research_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`brief_id` text NOT NULL,
	`current_version` text NOT NULL,
	`user_feedback` text,
	`is_approved` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`brief_id`) REFERENCES `research_briefs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `research_plans_brief_id_idx` ON `research_plans` (`brief_id`);