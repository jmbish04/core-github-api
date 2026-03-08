CREATE TABLE IF NOT EXISTS `repo_ai_context` (
	`repo_id` text PRIMARY KEY NOT NULL,
	`embedding_id` text,
	`tokens_estimate` integer,
	`last_indexed_at` text,
	`index_version` integer,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `repo_infra` (
	`repo_id` text PRIMARY KEY NOT NULL,
	`provider` text,
	`uses_workers` integer DEFAULT false,
	`uses_pages` integer DEFAULT false,
	`uses_d1` integer DEFAULT false,
	`uses_kv` integer DEFAULT false,
	`uses_r2` integer DEFAULT false,
	`uses_queues` integer DEFAULT false,
	`uses_vectorize` integer DEFAULT false,
	`wrangler_path` text,
	`envs_json` text,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `repo_metrics` (
	`repo_id` text PRIMARY KEY NOT NULL,
	`default_branch` text,
	`open_issues` integer,
	`open_prs` integer,
	`stars` integer,
	`forks` integer,
	`loc_total` integer,
	`loc_typescript` integer,
	`loc_javascript` integer,
	`loc_python` integer,
	`has_tests` integer DEFAULT false,
	`test_framework` text,
	`ci_provider` text,
	`coverage_percent` real,
	`last_commit_at` text,
	`last_release_tag` text,
	`last_release_at` text,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `repo_tags` (
	`repo_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`repo_id`, `tag`),
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `repo_tech_stack` (
	`repo_id` text NOT NULL,
	`domain` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`source` text,
	PRIMARY KEY(`repo_id`, `domain`, `key`),
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`repo_url` text NOT NULL,
	`homepage_url` text,
	`description` text,
	`topics_json` text,
	`visibility` text NOT NULL,
	`lifecycle_stage` text,
	`is_template` integer DEFAULT false NOT NULL,
	`criticality` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_scanned_at` text,
	`human_summary` text,
	`ai_summary` text,
	`notes` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_slug_unique` ON `repositories` (`slug`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `code_review_comment_enrichments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comment_id` integer NOT NULL,
	`source` text NOT NULL,
	`tool_name` text,
	`request_summary` text,
	`request_payload_json` text,
	`response_summary` text,
	`response_body` text,
	`response_metadata_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`comment_id`) REFERENCES `code_review_comments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_enrichments_comment` ON `code_review_comment_enrichments` (`comment_id`);--> statement-breakpoint
CREATE INDEX `idx_enrichments_source` ON `code_review_comment_enrichments` (`source`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `code_review_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`provider` text NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`repo_full_name` text NOT NULL,
	`pr_number` integer NOT NULL,
	`external_id` integer NOT NULL,
	`html_url` text NOT NULL,
	`file_path` text NOT NULL,
	`line` integer,
	`start_line` integer,
	`original_line` integer,
	`body_markdown` text NOT NULL,
	`diff_hunk` text,
	`priority` text,
	`summary` text,
	`main_suggestion_code` text,
	`author_login` text NOT NULL,
	`author_avatar_url` text,
	`created_at` text NOT NULL,
	`updated_at` text,
	`last_seen_at` text,
	`status` text DEFAULT 'open' NOT NULL,
	`assignee` text DEFAULT 'unassigned' NOT NULL,
	`resolved_at` text,
	`resolution_notes` text,
	`category` text,
	`tags_json` text,
	`embedding_id` text,
	`embedding_model` text,
	`last_vectorized_at` text,
	FOREIGN KEY (`run_id`) REFERENCES `code_review_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_code_review_comments_run` ON `code_review_comments` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_code_review_comments_repo_pr` ON `code_review_comments` (`repo_owner`,`repo_name`,`pr_number`);--> statement-breakpoint
CREATE INDEX `idx_code_review_comments_external_id` ON `code_review_comments` (`external_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `code_review_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`repo_full_name` text NOT NULL,
	`pr_number` integer NOT NULL,
	`pr_title` text,
	`pr_url` text,
	`ai_reviewer` text NOT NULL,
	`ai_reviewer_login` text,
	`ai_reviewer_avatar_url` text,
	`extracted_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_code_review_runs_repo_pr` ON `code_review_runs` (`repo_owner`,`repo_name`,`pr_number`);--> statement-breakpoint
CREATE INDEX `idx_code_review_runs_provider_repo_pr` ON `code_review_runs` (`provider`,`repo_full_name`,`pr_number`);