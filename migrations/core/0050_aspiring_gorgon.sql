PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__new_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'info' NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`link_url` text,
	`process_origin` text DEFAULT 'system' NOT NULL,
	`repo_origin` text,
	`worker_origin` text,
	`is_action_needed` integer DEFAULT false NOT NULL,
	`action_required` text,
	`is_resolved` integer DEFAULT false NOT NULL,
	`timestamp_resolved` integer,
	`resolved_by` text,
	`dismissed_at` text,
	`dismissed_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_alerts`("id", "type", "severity", "title", "description", "link_url", "process_origin", "repo_origin", "worker_origin", "is_action_needed", "action_required", "is_resolved", "timestamp_resolved", "resolved_by", "dismissed_at", "dismissed_by", "created_at") SELECT "id", "type", "severity", "title", "description", "link_url", "process_origin", "repo_origin", "worker_origin", "is_action_needed", "action_required", "is_resolved", "timestamp_resolved", "resolved_by", "dismissed_at", "dismissed_by", "created_at" FROM `alerts`;--> statement-breakpoint
DROP TABLE `alerts`;--> statement-breakpoint
ALTER TABLE `__new_alerts` RENAME TO `alerts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `alerts_type_idx` ON `alerts` (`type`);--> statement-breakpoint
CREATE INDEX `alerts_severity_idx` ON `alerts` (`severity`);--> statement-breakpoint
CREATE INDEX `alerts_created_at_idx` ON `alerts` (`created_at`);--> statement-breakpoint
CREATE INDEX `alerts_dismissed_idx` ON `alerts` (`dismissed_at`);