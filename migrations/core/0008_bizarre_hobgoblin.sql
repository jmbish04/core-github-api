CREATE TABLE `collaboration_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`source_agent` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`timestamp` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `collaboration_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `collaboration_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`joined_at` text NOT NULL,
	`left_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `collaboration_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `collaboration_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`initiated_by` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
