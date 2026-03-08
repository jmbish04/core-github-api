CREATE TABLE IF NOT EXISTS `container_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` integer,
	`command` text,
	`status` text,
	`output` text,
	`created_at` text
);
