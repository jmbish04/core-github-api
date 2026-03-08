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
CREATE TABLE IF NOT EXISTS `events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`action` text,
	`title` text NOT NULL,
	`description` text,
	`url` text,
	`actor_login` text,
	`actor_avatar` text,
	`repo_name` text,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_timestamp` ON `events` (`timestamp`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`rule_name` text NOT NULL,
	`workflow` text NOT NULL,
	`event_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_automation_runs_event` ON `automation_runs` (`event_id`);