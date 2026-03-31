CREATE TABLE `request_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`driver` text NOT NULL,
	`storage_key` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `planning_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_planning_request_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`jules_session_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `planning_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_planning_request_events`("id", "request_id", "jules_session_id", "payload", "created_at") SELECT "id", "request_id", "jules_session_id", "payload", "created_at" FROM `planning_request_events`;--> statement-breakpoint
DROP TABLE `planning_request_events`;--> statement-breakpoint
ALTER TABLE `__new_planning_request_events` RENAME TO `planning_request_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;