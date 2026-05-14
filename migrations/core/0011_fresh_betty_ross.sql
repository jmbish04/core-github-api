CREATE TABLE `browser_tool_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`input` text,
	`output` text,
	`duration_ms` integer,
	`status` text DEFAULT 'success' NOT NULL,
	`error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `observability_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel` text NOT NULL,
	`event_type` text NOT NULL,
	`agent` text NOT NULL,
	`name` text NOT NULL,
	`payload` text,
	`event_timestamp` text NOT NULL,
	`captured_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `web_query_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`execution_id` text NOT NULL,
	`facet_name` text NOT NULL,
	`query` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_summary` text,
	`started_at` text NOT NULL,
	`finished_at` text
);
