CREATE TABLE IF NOT EXISTS `repo_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`visibility` text DEFAULT 'private',
	`infra_type` text,
	`frontend_config` text,
	`status` text DEFAULT 'draft',
	`ai_generated_proposal` text,
	`user_adjustments` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
