CREATE TABLE `agentic_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX `agentic_sessions_status_idx` ON `agentic_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `agentic_sessions_created_by_idx` ON `agentic_sessions` (`created_by`);--> statement-breakpoint
CREATE INDEX `agentic_sessions_created_at_idx` ON `agentic_sessions` (`created_at`);--> statement-breakpoint
CREATE TABLE `agentic_session_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	`sequence_num` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agentic_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agentic_session_events_session_idx` ON `agentic_session_events` (`session_id`);--> statement-breakpoint
CREATE INDEX `agentic_session_events_type_idx` ON `agentic_session_events` (`type`);--> statement-breakpoint
CREATE INDEX `agentic_session_events_timestamp_idx` ON `agentic_session_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `agentic_session_events_sequence_idx` ON `agentic_session_events` (`session_id`,`sequence_num`);--> statement-breakpoint
CREATE TABLE `agentic_session_subscribers` (
	`session_id` text NOT NULL,
	`subscriber_id` text NOT NULL,
	`subscriber_type` text NOT NULL,
	`connected_at` integer DEFAULT (unixepoch()) NOT NULL,
	`disconnected_at` integer,
	`last_heartbeat` integer,
	PRIMARY KEY(`session_id`, `subscriber_id`),
	FOREIGN KEY (`session_id`) REFERENCES `agentic_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agentic_session_subscribers_session_idx` ON `agentic_session_subscribers` (`session_id`);--> statement-breakpoint
CREATE INDEX `agentic_session_subscribers_subscriber_idx` ON `agentic_session_subscribers` (`subscriber_id`);--> statement-breakpoint
CREATE INDEX `agentic_session_subscribers_connected_at_idx` ON `agentic_session_subscribers` (`connected_at`);--> statement-breakpoint
CREATE TABLE `agentic_session_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`grantee_id` text NOT NULL,
	`grantee_type` text NOT NULL,
	`permissions` text NOT NULL,
	`granted_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer,
	`revoked` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `agentic_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agentic_session_grants_session_idx` ON `agentic_session_grants` (`session_id`);--> statement-breakpoint
CREATE INDEX `agentic_session_grants_grantee_idx` ON `agentic_session_grants` (`grantee_id`);--> statement-breakpoint
CREATE INDEX `agentic_session_grants_expires_at_idx` ON `agentic_session_grants` (`expires_at`);