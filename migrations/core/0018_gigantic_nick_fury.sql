CREATE TABLE IF NOT EXISTS `system_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`meta` text,
	`source_file` text NOT NULL,
	`line_number` integer NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `system_logs_timestamp_idx` ON `system_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `system_logs_level_idx` ON `system_logs` (`level`);--> statement-breakpoint
CREATE INDEX `system_logs_source_idx` ON `system_logs` (`source_file`);