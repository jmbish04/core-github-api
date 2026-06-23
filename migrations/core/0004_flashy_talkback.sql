CREATE TABLE `jules_build_analysis` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`repo_full_name` text NOT NULL,
	`pr_number` integer,
	`jules_prompt` text,
	`jules_response` text,
	`raw_logs` text,
	`status` text DEFAULT 'analyzed' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `jules_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `jules_build_analysis_status_idx` ON `jules_build_analysis` (`status`);--> statement-breakpoint
CREATE INDEX `jules_build_analysis_repo_idx` ON `jules_build_analysis` (`repo_full_name`);--> statement-breakpoint
CREATE INDEX `jules_build_analysis_session_idx` ON `jules_build_analysis` (`session_id`);--> statement-breakpoint
CREATE TABLE `jules_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`proposed_payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`human_feedback` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `jules_build_analysis`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `jules_approvals_status_idx` ON `jules_approvals` (`status`);--> statement-breakpoint
CREATE INDEX `jules_approvals_workflow_idx` ON `jules_approvals` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `jules_approvals_entity_idx` ON `jules_approvals` (`entity_type`,`entity_id`);