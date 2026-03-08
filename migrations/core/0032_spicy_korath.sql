CREATE TABLE IF NOT EXISTS `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`process_origin` text NOT NULL,
	`repo_origin` text NOT NULL,
	`worker_origin` text NOT NULL,
	`is_action_needed` integer DEFAULT false NOT NULL,
	`action_required` text,
	`is_resolved` integer DEFAULT false NOT NULL,
	`timestamp_resolved` integer,
	`resolved_by` text
);
--> statement-breakpoint
-- CREATE INDEX `alerts_timestamp_idx` ON `alerts` (`timestamp`);--> statement-breakpoint
-- CREATE INDEX `alerts_resolved_idx` ON `alerts` (`is_resolved`);