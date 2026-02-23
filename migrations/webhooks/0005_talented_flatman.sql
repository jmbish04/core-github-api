CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_id` text NOT NULL,
	`repo_full_name` text NOT NULL,
	`trigger_event` text NOT NULL,
	`analysis_detail` text NOT NULL,
	`action_taken` text NOT NULL,
	`verification_status` text NOT NULL,
	`verification_reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_delivery_idx` ON `audit_logs` (`delivery_id`);--> statement-breakpoint
CREATE INDEX `audit_repo_idx` ON `audit_logs` (`repo_full_name`);--> statement-breakpoint
CREATE INDEX `audit_event_idx` ON `audit_logs` (`trigger_event`);