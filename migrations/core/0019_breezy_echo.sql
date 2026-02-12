CREATE TABLE `ai_cost_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost` real DEFAULT 0 NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_cost_logs_session_idx` ON `ai_cost_logs` (`session_id`);--> statement-breakpoint
CREATE INDEX `ai_cost_logs_timestamp_idx` ON `ai_cost_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `ai_cost_logs_model_idx` ON `ai_cost_logs` (`model`);--> statement-breakpoint
CREATE TABLE `budget_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`threshold` real NOT NULL,
	`current_spend` real NOT NULL,
	`message` text NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `budget_events_timestamp_idx` ON `budget_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `budget_events_type_idx` ON `budget_events` (`event_type`);