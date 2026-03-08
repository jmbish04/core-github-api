CREATE TABLE IF NOT EXISTS `task_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`content` text NOT NULL,
	`author` text NOT NULL,
	`github_comment_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_comments_task` ON `task_comments` (`task_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`github_issue_id` integer,
	`request_id` text,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`details` text,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_events_task` ON `task_events` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_events_req` ON `task_events` (`request_id`);