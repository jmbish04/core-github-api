CREATE TABLE `operation_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo_id` text NOT NULL,
	`action_type` text NOT NULL,
	`status` text NOT NULL,
	`pr_url` text,
	`details_json` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_operation_logs_repo` ON `operation_logs` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_operation_logs_action` ON `operation_logs` (`action_type`);--> statement-breakpoint
ALTER TABLE `repositories` ADD `fingerprint_json` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `last_audit_at` text;