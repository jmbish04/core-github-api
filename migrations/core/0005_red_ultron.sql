CREATE TABLE `hitl_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`category` text NOT NULL,
	`entity_id` text,
	`proposed_payload` text NOT NULL,
	`context_metadata` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`human_feedback` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
