CREATE TABLE IF NOT EXISTS `agent_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`step_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`details` text,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "status_check" CHECK("agent_activities"."status" IN ('pending','active','completed','failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_agent_activities_op` ON `agent_activities` (`operation_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `repo_stats` (
	`repo_id` integer PRIMARY KEY NOT NULL,
	`health_score` integer,
	`open_issues_count` integer,
	`prs_merged_this_week` integer,
	`last_updated` text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "health_score_check" CHECK("repo_stats"."health_score" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'backlog' NOT NULL,
	`priority` text DEFAULT 'low' NOT NULL,
	`assignee` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`position` integer DEFAULT 0,
	CONSTRAINT "status_check" CHECK("tasks"."status" IN ('backlog','todo','in-progress','review','done')),
	CONSTRAINT "priority_check" CHECK("tasks"."priority" IN ('low','medium','high','critical'))
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_repo` ON `tasks` (`repo_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`author` text NOT NULL,
	`message` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_tags` (
	`thread_id` text NOT NULL,
	`chat_id` integer NOT NULL,
	`tag` text NOT NULL,
	`notes` text,
	PRIMARY KEY(`thread_id`, `chat_id`, `tag`),
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text,
	`repo_id` text,
	`timestamp_started` text NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `request_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`payload_size_bytes` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`metadata` text
);
