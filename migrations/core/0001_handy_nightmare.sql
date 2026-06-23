CREATE TABLE `agent_state_mirror` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_type` text NOT NULL,
	`agent_id` text NOT NULL,
	`state_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agent_state_mirror_agent` ON `agent_state_mirror` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_state_mirror_type` ON `agent_state_mirror` (`agent_type`);--> statement-breakpoint
CREATE TABLE `planning_room_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text,
	`user_name` text,
	`message_type` text NOT NULL,
	`content` text,
	`metadata_json` text,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_planning_room_logs_room` ON `planning_room_logs` (`room_id`);--> statement-breakpoint
CREATE INDEX `idx_planning_room_logs_timestamp` ON `planning_room_logs` (`timestamp`);--> statement-breakpoint
ALTER TABLE `epics` ADD `plan_revision_id` text REFERENCES plan_revisions(id);--> statement-breakpoint
CREATE INDEX `idx_epics_revision` ON `epics` (`plan_revision_id`);