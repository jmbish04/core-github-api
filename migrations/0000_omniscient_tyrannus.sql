CREATE TABLE IF NOT EXISTS `gh_management_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`repo_name` text NOT NULL,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`status_details` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE INDEX `idx_gh_management_config_timestamp` ON `gh_management_config` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_gh_management_config_repo_name` ON `gh_management_config` (`repo_name`);--> statement-breakpoint
CREATE INDEX `idx_gh_management_config_action` ON `gh_management_config` (`action`);--> statement-breakpoint
CREATE INDEX `idx_gh_management_config_status` ON `gh_management_config` (`status`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `repo_analysis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text,
	`search_id` integer,
	`repo_full_name` text,
	`repo_url` text,
	`description` text,
	`relevancy_score` real,
	`analyzed_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`session_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`search_id`) REFERENCES `searches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repo_analysis_session_id_repo_full_name_unique` ON `repo_analysis` (`session_id`,`repo_full_name`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX `idx_request_logs_timestamp` ON `request_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_request_logs_correlation_id` ON `request_logs` (`correlation_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `searches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text,
	`search_term` text,
	`status` text DEFAULT 'pending',
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`session_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text,
	`prompt` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_session_id_unique` ON `sessions` (`session_id`);