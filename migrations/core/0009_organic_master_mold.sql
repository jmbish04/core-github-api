CREATE TABLE `agent_skill_allowed_tools` (
	`id` text PRIMARY KEY NOT NULL,
	`skill_id` text NOT NULL,
	`tool_name` text NOT NULL,
	FOREIGN KEY (`skill_id`) REFERENCES `agent_skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `skill_allowed_tools_skill_idx` ON `agent_skill_allowed_tools` (`skill_id`);--> statement-breakpoint
CREATE INDEX `skill_allowed_tools_tool_idx` ON `agent_skill_allowed_tools` (`tool_name`);--> statement-breakpoint
CREATE TABLE `agent_skill_references` (
	`id` text PRIMARY KEY NOT NULL,
	`skill_id` text NOT NULL,
	`reference_type` text NOT NULL,
	`reference_name` text NOT NULL,
	FOREIGN KEY (`skill_id`) REFERENCES `agent_skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `skill_references_skill_idx` ON `agent_skill_references` (`skill_id`);--> statement-breakpoint
CREATE INDEX `skill_references_ref_name_idx` ON `agent_skill_references` (`reference_name`);--> statement-breakpoint
CREATE TABLE `fleet_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`worker_name` text NOT NULL,
	`account_id` text,
	`repo_owner` text,
	`repo_name` text,
	`source` text NOT NULL,
	`failure_type` text NOT NULL,
	`failure_message` text NOT NULL,
	`pattern_hash` text NOT NULL,
	`recurrence_count` integer DEFAULT 1 NOT NULL,
	`context_metadata` text,
	`hitl_promoted` integer DEFAULT 0 NOT NULL,
	`hitl_record_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_fleet_obs_pattern_hash` ON `fleet_observations` (`pattern_hash`);--> statement-breakpoint
CREATE INDEX `idx_fleet_obs_worker_name` ON `fleet_observations` (`worker_name`);--> statement-breakpoint
CREATE INDEX `idx_fleet_obs_source` ON `fleet_observations` (`source`);--> statement-breakpoint
CREATE TABLE `tracked_items` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`content` text,
	`ai_summary` text,
	`published_at` text,
	`emailed` integer DEFAULT false NOT NULL,
	`hitl_queued` integer DEFAULT false NOT NULL,
	`hitl_record_id` text,
	`processed_by_learning_agent` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `tracked_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tracked_items_source_idx` ON `tracked_items` (`source_id`);--> statement-breakpoint
CREATE INDEX `tracked_items_emailed_idx` ON `tracked_items` (`emailed`);--> statement-breakpoint
CREATE INDEX `tracked_items_hitl_idx` ON `tracked_items` (`hitl_queued`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_items_url_idx` ON `tracked_items` (`url`);--> statement-breakpoint
CREATE TABLE `tracked_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`query_or_url` text NOT NULL,
	`name` text NOT NULL,
	`frequency` text DEFAULT 'daily' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_checked_at` text,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tracked_sources_type_idx` ON `tracked_sources` (`type`);--> statement-breakpoint
CREATE INDEX `tracked_sources_active_idx` ON `tracked_sources` (`is_active`,`last_checked_at`);--> statement-breakpoint
ALTER TABLE `hitl_queue` ADD `proposal_target` text;--> statement-breakpoint
ALTER TABLE `hitl_queue` ADD `target_worker_name` text;--> statement-breakpoint
ALTER TABLE `hitl_queue` ADD `target_repo_full_name` text;--> statement-breakpoint
ALTER TABLE `hitl_queue` ADD `proposal_target_locked` integer DEFAULT 0;