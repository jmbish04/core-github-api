CREATE TABLE `automation_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`repo` text NOT NULL,
	`automation_class` text NOT NULL,
	`status` text NOT NULL,
	`details` text,
	`pr_or_issue_number` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_class` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`use_pat` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_configs_automation_class_unique` ON `webhook_configs` (`automation_class`);