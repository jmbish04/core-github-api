DROP TABLE `request_artifacts`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_planning_request_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`source` text NOT NULL,
	`event_type` text NOT NULL,
	`title` text,
	`message` text,
	`payload_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_planning_request_events`("id", "request_id", "source", "event_type", "title", "message", "payload_json", "created_at") SELECT "id", "request_id", "source", "event_type", "title", "message", "payload_json", "created_at" FROM `planning_request_events`;--> statement-breakpoint
DROP TABLE `planning_request_events`;--> statement-breakpoint
ALTER TABLE `__new_planning_request_events` RENAME TO `planning_request_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `planning_request_events_request_idx` ON `planning_request_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `planning_request_events_source_idx` ON `planning_request_events` (`source`);--> statement-breakpoint
CREATE INDEX `planning_request_events_type_idx` ON `planning_request_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `planning_request_events_created_idx` ON `planning_request_events` (`created_at`);