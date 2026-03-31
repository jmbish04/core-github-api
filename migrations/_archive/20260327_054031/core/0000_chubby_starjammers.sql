CREATE TABLE `ai_cost_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost` real DEFAULT 0 NOT NULL,
	`document_id` text,
	`workflow_name` text,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_cost_logs_session_idx` ON `ai_cost_logs` (`session_id`);--> statement-breakpoint
CREATE INDEX `ai_cost_logs_timestamp_idx` ON `ai_cost_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `ai_cost_logs_model_idx` ON `ai_cost_logs` (`model`);--> statement-breakpoint
CREATE TABLE `budget_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`threshold` real NOT NULL,
	`current_spend` real NOT NULL,
	`message` text NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `budget_events_timestamp_idx` ON `budget_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `budget_events_type_idx` ON `budget_events` (`event_type`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`author` text NOT NULL,
	`message` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_tags` (
	`thread_id` text NOT NULL,
	`chat_id` integer NOT NULL,
	`tag` text NOT NULL,
	`notes` text,
	PRIMARY KEY(`thread_id`, `chat_id`, `tag`),
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text,
	`repo_id` text,
	`agent_id` text,
	`timestamp_started` text NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `cloudflare_docs_interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`source` text NOT NULL,
	`github_url` text,
	`user_prompt` text NOT NULL,
	`mcp_query` text,
	`mcp_response` text,
	`response_sent` text NOT NULL,
	`follow_up_prompts` text,
	`provider` text,
	`model_used` text,
	`error` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`step_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`details` text,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "status_check" CHECK("agent_activities"."status" IN ('pending','active','completed','failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_agent_activities_op` ON `agent_activities` (`operation_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`action` text,
	`title` text NOT NULL,
	`description` text,
	`url` text,
	`actor_login` text,
	`actor_avatar` text,
	`repo_name` text,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_timestamp` ON `events` (`timestamp`);--> statement-breakpoint
CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`rule_name` text NOT NULL,
	`workflow` text NOT NULL,
	`event_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_automation_runs_event` ON `automation_runs` (`event_id`);--> statement-breakpoint
CREATE TABLE `pricing_change_log` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`model_name` text NOT NULL,
	`change_type` text NOT NULL,
	`old_input_cost_per_m` real,
	`old_output_cost_per_m` real,
	`old_input_long_cost_per_m` real,
	`old_output_long_cost_per_m` real,
	`old_cache_read_cost_per_m` real,
	`old_cache_write_cost_per_m` real,
	`new_input_cost_per_m` real NOT NULL,
	`new_output_cost_per_m` real NOT NULL,
	`new_input_long_cost_per_m` real,
	`new_output_long_cost_per_m` real,
	`new_cache_read_cost_per_m` real,
	`new_cache_write_cost_per_m` real,
	`source_url` text NOT NULL,
	`detected_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pricing_change_provider_idx` ON `pricing_change_log` (`provider`);--> statement-breakpoint
CREATE INDEX `pricing_change_model_id_idx` ON `pricing_change_log` (`model_id`);--> statement-breakpoint
CREATE INDEX `pricing_change_detected_at_idx` ON `pricing_change_log` (`detected_at`);--> statement-breakpoint
CREATE INDEX `pricing_change_type_idx` ON `pricing_change_log` (`change_type`);--> statement-breakpoint
CREATE TABLE `pricing_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`model_name` text NOT NULL,
	`input_cost_per_m` real NOT NULL,
	`output_cost_per_m` real NOT NULL,
	`input_long_cost_per_m` real,
	`output_long_cost_per_m` real,
	`cache_read_cost_per_m` real,
	`cache_write_cost_per_m` real,
	`metadata` text,
	`source_url` text NOT NULL,
	`scraped_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pricing_provider_idx` ON `pricing_snapshots` (`provider`);--> statement-breakpoint
CREATE INDEX `pricing_model_id_idx` ON `pricing_snapshots` (`model_id`);--> statement-breakpoint
CREATE INDEX `pricing_scraped_at_idx` ON `pricing_snapshots` (`scraped_at`);--> statement-breakpoint
CREATE INDEX `pricing_provider_model_idx` ON `pricing_snapshots` (`provider`,`model_id`);--> statement-breakpoint
CREATE TABLE `prompt_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`prior_config_prompt` text NOT NULL,
	`new_config_prompt_value` text NOT NULL,
	`removed_language` text,
	`added_language` text,
	`changed_by` text DEFAULT 'ui' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `analysis_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`repo_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `research_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `repo_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`repo_id` text NOT NULL,
	`sample_score` real,
	`sample_reasoning` text,
	`code_quality` real,
	`modularity` real,
	`performance` real,
	`security` real,
	`analysis_summary` text,
	`final_score` real,
	`judge_reasoning` text,
	`strengths` text,
	`weaknesses` text,
	`recommendation` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `research_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `research_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`repo` text NOT NULL,
	`filename` text NOT NULL,
	`filepath` text NOT NULL,
	`extension` text,
	`size_bytes` integer,
	`analysis` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `research_owner_repo_idx` ON `research_files` (`owner`,`repo`);--> statement-breakpoint
CREATE INDEX `research_filepath_idx` ON `research_files` (`filepath`);--> statement-breakpoint
CREATE INDEX `research_created_at_idx` ON `research_files` (`created_at`);--> statement-breakpoint
CREATE TABLE `research_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`query` text,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`error_message` text
);
--> statement-breakpoint
CREATE TABLE `agent_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`markdown_content` text NOT NULL,
	`github_path` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'info' NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`link_url` text,
	`process_origin` text DEFAULT 'system' NOT NULL,
	`repo_origin` text,
	`worker_origin` text,
	`is_action_needed` integer DEFAULT false NOT NULL,
	`action_required` text,
	`is_resolved` integer DEFAULT false NOT NULL,
	`timestamp_resolved` integer,
	`resolved_by` text,
	`dismissed_at` text,
	`dismissed_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `alerts_type_idx` ON `alerts` (`type`);--> statement-breakpoint
CREATE INDEX `alerts_severity_idx` ON `alerts` (`severity`);--> statement-breakpoint
CREATE INDEX `alerts_created_at_idx` ON `alerts` (`created_at`);--> statement-breakpoint
CREATE INDEX `alerts_dismissed_idx` ON `alerts` (`dismissed_at`);--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`url` text,
	`github_repo` text,
	`description` text,
	`summary` text,
	`last_deployed_date` integer,
	`last_traffic_date` integer,
	`last_build_date` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cloudflare_changelog` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`link` text NOT NULL,
	`description` text NOT NULL,
	`ai_summary` text,
	`pub_date` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL,
	`emailed` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `config_audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`changed_by` text DEFAULT 'system',
	`category` text NOT NULL,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`is_ignore` integer DEFAULT false,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_created_idx` ON `sessions` (`created_at`);--> statement-breakpoint
CREATE TABLE `organization_settings` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`preferred_provider` text DEFAULT 'worker-ai' NOT NULL,
	`preferred_model` text DEFAULT '@cf/meta/llama-3.3-70b-instruct-fp8-fast' NOT NULL,
	`enforce_golden_path` integer DEFAULT 1 NOT NULL,
	`custom_instructions` text,
	`golden_path_overrides_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_org_settings_provider` ON `organization_settings` (`preferred_provider`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`preferred_provider` text DEFAULT 'worker-ai' NOT NULL,
	`preferred_model` text DEFAULT '@cf/meta/llama-3.3-70b-instruct-fp8-fast' NOT NULL,
	`enforce_golden_path` integer DEFAULT 1 NOT NULL,
	`custom_instructions` text,
	`golden_path_overrides_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_user_settings_provider` ON `user_settings` (`preferred_provider`);--> statement-breakpoint
CREATE TABLE `repo_sync_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`target_repo_pattern` text DEFAULT '*' NOT NULL,
	`trigger_events` text DEFAULT '["push", "pull_request"]' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `repository_secret_defaults` (
	`id` text PRIMARY KEY NOT NULL,
	`secret_name` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repository_secret_defaults_secret_name_unique` ON `repository_secret_defaults` (`secret_name`);--> statement-breakpoint
CREATE TABLE `standardization_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`rule` text NOT NULL,
	`timestamp_created` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`timestamp_modified` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`timestamp_inactive` text
);
--> statement-breakpoint
CREATE TABLE `standardization_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`source_repo` text DEFAULT 'jmbish04/core-github-standardization' NOT NULL,
	`file_path` text NOT NULL,
	`description` text,
	`relevant_infra` text DEFAULT '[]' NOT NULL,
	`irrelevant_infra` text DEFAULT '[]' NOT NULL,
	`ai_instructions` text,
	`should_overwrite` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `standardization_tag_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`hex_color` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `standardization_tag_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`tag_id` text NOT NULL,
	`standardization_item_id` text NOT NULL,
	FOREIGN KEY (`tag_id`) REFERENCES `standardization_tag_definitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`standardization_item_id`) REFERENCES `standardization_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `system_config_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`config_key` text NOT NULL,
	`label` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_config_definitions_config_key_unique` ON `system_config_definitions` (`config_key`);--> statement-breakpoint
CREATE TABLE `tag_application_mapping` (
	`app_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`app_id`, `tag_id`),
	FOREIGN KEY (`app_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`hex_color` text DEFAULT '#3b82f6',
	`is_active` integer DEFAULT true,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `golden_path_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`rule` text NOT NULL,
	`scope_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`scope_id`) REFERENCES `golden_path_config_scopes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `golden_path_config_scopes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`infrastructure` text NOT NULL,
	`hex_color` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_golden_path_config_scopes_title` ON `golden_path_config_scopes` (`title`);--> statement-breakpoint
CREATE TABLE `golden_path_config_tag_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`hex_color` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_golden_path_config_tag_definitions_name` ON `golden_path_config_tag_definitions` (`name`);--> statement-breakpoint
CREATE TABLE `golden_path_config_tag_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`scope_id`) REFERENCES `golden_path_config_scopes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `golden_path_config_tag_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `automation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`trigger_event` text NOT NULL,
	`trigger_action` text,
	`trigger_branch` text,
	`workflow` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `automation_runner_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`automation_key` text NOT NULL,
	`trigger_event` text NOT NULL,
	`runner_kind` text NOT NULL,
	`target_ref` text,
	`repo_owner` text,
	`repo_name` text,
	`branch_pattern` text,
	`infrastructure` text,
	`priority` integer DEFAULT 100 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_automation_runner_policies_automation` ON `automation_runner_policies` (`automation_key`);--> statement-breakpoint
CREATE INDEX `idx_automation_runner_policies_active` ON `automation_runner_policies` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_automation_runner_policies_event` ON `automation_runner_policies` (`trigger_event`);--> statement-breakpoint
CREATE TABLE `action_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`action_type` text NOT NULL,
	`target_repo` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`request_payload` text,
	`response_payload` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `action_logs_task_id_idx` ON `action_logs` (`task_id`);--> statement-breakpoint
CREATE INDEX `action_logs_status_idx` ON `action_logs` (`status`);--> statement-breakpoint
CREATE INDEX `action_logs_action_type_idx` ON `action_logs` (`action_type`);--> statement-breakpoint
CREATE TABLE `unified_action_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`task_type` text NOT NULL,
	`github_owner` text NOT NULL,
	`github_repo` text NOT NULL,
	`project_id` text,
	`request_payload` text NOT NULL,
	`response_payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unified_action_logs_task_id_unique` ON `unified_action_logs` (`task_id`);--> statement-breakpoint
CREATE TABLE `research_judgments` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt` text NOT NULL,
	`status` text NOT NULL,
	`judge_notes` text,
	`findings` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `newsletter_repos` (
	`repo_url` text PRIMARY KEY NOT NULL,
	`published_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`repo_url` text NOT NULL,
	`summary` text NOT NULL,
	`agent_role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discord_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_name` text,
	`author_id` text,
	`author_username` text,
	`content` text NOT NULL,
	`discord_timestamp` text NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`ai_score` integer,
	`ai_summary` text,
	`analysed` integer DEFAULT false NOT NULL,
	`ingested_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `discord_messages_channel_id_idx` ON `discord_messages` (`channel_id`);--> statement-breakpoint
CREATE INDEX `discord_messages_guild_id_idx` ON `discord_messages` (`guild_id`);--> statement-breakpoint
CREATE INDEX `discord_messages_category_idx` ON `discord_messages` (`category`);--> statement-breakpoint
CREATE INDEX `discord_messages_analysed_idx` ON `discord_messages` (`analysed`);--> statement-breakpoint
CREATE TABLE `discord_scan_log` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_name` text,
	`last_message_id` text,
	`last_scanned_at` integer NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discord_scan_log_channel_id_unique` ON `discord_scan_log` (`channel_id`);--> statement-breakpoint
CREATE INDEX `discord_scan_log_guild_id_idx` ON `discord_scan_log` (`guild_id`);--> statement-breakpoint
CREATE TABLE `container_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` integer,
	`command` text,
	`status` text,
	`output` text,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `docs_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`icon_name` text DEFAULT 'Sparkles' NOT NULL,
	`icon_bg` text DEFAULT 'bg-indigo-500/10 border border-indigo-500/20' NOT NULL,
	`icon_color` text DEFAULT 'text-indigo-400' NOT NULL,
	`workshop_url` text,
	`docs_slug` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `repo_drafts` (
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
--> statement-breakpoint
CREATE TABLE `project_favorites` (
	`user_id` text NOT NULL,
	`project_id` text,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`time_favorited` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`time_unfavorited` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `repo_owner`, `repo_name`)
);
--> statement-breakpoint
CREATE INDEX `idx_project_favorites_user` ON `project_favorites` (`user_id`);--> statement-breakpoint
CREATE TABLE `pr_overviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`pr_number` integer NOT NULL,
	`ai_summary` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pr_overviews_lookup` ON `pr_overviews` (`repo_owner`,`repo_name`,`pr_number`);--> statement-breakpoint
CREATE TABLE `pr_comments` (
	`id` integer PRIMARY KEY NOT NULL,
	`pr_number` integer NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`type` text NOT NULL,
	`author` text NOT NULL,
	`author_avatar` text,
	`body` text NOT NULL,
	`path` text,
	`line` integer,
	`html_url` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pr_comments_pr_idx` ON `pr_comments` (`repo_owner`,`repo_name`,`pr_number`);--> statement-breakpoint
CREATE TABLE `pull_requests` (
	`id` integer PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`state` text NOT NULL,
	`author` text NOT NULL,
	`author_avatar` text,
	`html_url` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pull_requests_number_idx` ON `pull_requests` (`repo_owner`,`repo_name`,`number`);--> statement-breakpoint
CREATE TABLE `operation_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo_id` text NOT NULL,
	`action_type` text NOT NULL,
	`status` text NOT NULL,
	`pr_url` text,
	`details_json` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_operation_logs_repo` ON `operation_logs` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_operation_logs_action` ON `operation_logs` (`action_type`);--> statement-breakpoint
CREATE TABLE `repo_ai_context` (
	`repo_id` text PRIMARY KEY NOT NULL,
	`embedding_id` text,
	`tokens_estimate` integer,
	`last_indexed_at` text,
	`index_version` integer,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `repo_infra` (
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
CREATE TABLE `repo_metrics` (
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
CREATE TABLE `repo_stats` (
	`repo_id` text PRIMARY KEY NOT NULL,
	`health_score` integer,
	`open_issues_count` integer,
	`prs_merged_this_week` integer,
	`last_updated` text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "health_score_check" CHECK("repo_stats"."health_score" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE `repo_tags` (
	`repo_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`repo_id`, `tag`),
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `repo_tech_stack` (
	`repo_id` text NOT NULL,
	`domain` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`source` text,
	PRIMARY KEY(`repo_id`, `domain`, `key`),
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`infrastructure` text,
	`repo_url` text NOT NULL,
	`homepage_url` text,
	`description` text,
	`topics_json` text,
	`visibility` text NOT NULL,
	`fingerprint_json` text,
	`last_audit_at` text,
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
CREATE TABLE `discord_research_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`guild_id` text NOT NULL,
	`channels` text,
	`prompt` text,
	`cron_schedule` text,
	`is_active` integer DEFAULT true,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	`updated_at` integer DEFAULT (strftime('%s', 'now'))
);
--> statement-breakpoint
CREATE TABLE `discord_scan_watermarks` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`last_message_id` text,
	`last_message_timestamp` text,
	`updated_at` integer DEFAULT (strftime('%s', 'now'))
);
--> statement-breakpoint
CREATE TABLE `research_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`title` text NOT NULL,
	`raw_brief_content` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `research_briefs_user_id_idx` ON `research_briefs` (`user_id`);--> statement-breakpoint
CREATE INDEX `research_briefs_status_idx` ON `research_briefs` (`status`);--> statement-breakpoint
CREATE TABLE `research_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`brief_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_url` text NOT NULL,
	`source_type` text NOT NULL,
	`initial_summary` text,
	`judge_score` integer,
	`judge_reasoning` text,
	`user_rating` text DEFAULT 'pending',
	`metadata` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`brief_id`) REFERENCES `research_briefs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `research_candidates_brief_id_idx` ON `research_candidates` (`brief_id`);--> statement-breakpoint
CREATE INDEX `research_candidates_source_url_idx` ON `research_candidates` (`source_url`);--> statement-breakpoint
CREATE TABLE `research_execution_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`brief_id` text,
	`run_id` text,
	`agent_name` text NOT NULL,
	`step_name` text NOT NULL,
	`log_level` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`brief_id`) REFERENCES `research_briefs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `research_execution_logs_brief_id_idx` ON `research_execution_logs` (`brief_id`);--> statement-breakpoint
CREATE INDEX `research_execution_logs_run_id_idx` ON `research_execution_logs` (`run_id`);--> statement-breakpoint
CREATE INDEX `research_execution_logs_created_at_idx` ON `research_execution_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `research_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`brief_id` text NOT NULL,
	`current_version` text NOT NULL,
	`user_feedback` text,
	`is_approved` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`brief_id`) REFERENCES `research_briefs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `research_plans_brief_id_idx` ON `research_plans` (`brief_id`);--> statement-breakpoint
CREATE TABLE `research_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`goal` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`global_deduplication` integer DEFAULT true NOT NULL,
	`cron_schedule` text,
	`github_terms` text,
	`discord_terms` text,
	`discord_selected_channels` text,
	`google_terms` text,
	`progress` integer DEFAULT 0,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	`updated_at` integer DEFAULT (strftime('%s', 'now'))
);
--> statement-breakpoint
CREATE TABLE `research_recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`repo_name` text NOT NULL,
	`repo_url` text NOT NULL,
	`description` text,
	`stars` integer DEFAULT 0,
	`ai_score` real,
	`ai_reasoning` text,
	`human_rating` integer,
	`human_feedback` text,
	`is_reviewed` integer DEFAULT false,
	`created_at` integer DEFAULT (strftime('%s', 'now'))
);
--> statement-breakpoint
CREATE TABLE `research_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`findings` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`project_id`) REFERENCES `research_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `code_review_comment_enrichments` (
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
CREATE TABLE `code_review_comments` (
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
CREATE TABLE `code_review_runs` (
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
CREATE INDEX `idx_code_review_runs_provider_repo_pr` ON `code_review_runs` (`provider`,`repo_full_name`,`pr_number`);--> statement-breakpoint
CREATE TABLE `starred_repos` (
	`user_id` text NOT NULL,
	`repo_id` text NOT NULL,
	`starred_at` text DEFAULT CURRENT_TIMESTAMP,
	`sync_batch_id` text,
	PRIMARY KEY(`user_id`, `repo_id`),
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_starred_repos_user` ON `starred_repos` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_starred_repos_repo` ON `starred_repos` (`repo_id`);--> statement-breakpoint
CREATE TABLE `check_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`check_run_id` integer,
	`head_sha` text,
	`status` text,
	`conclusion` text,
	`started_at` text,
	`completed_at` text,
	`app_id` integer,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `check_run_delivery_idx` ON `check_run` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `code_scanning_alert` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`alert_number` integer,
	`alert_url` text,
	`state` text,
	`resolution` text,
	`severity` text,
	`rule_id` text,
	`tool_name` text,
	`created_at` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `code_scanning_alert_delivery_idx` ON `code_scanning_alert` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `commit_comment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`comment_id` integer,
	`commit_id` text,
	`body` text,
	`position` integer,
	`line` integer,
	`path` text,
	`author_login` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `commit_comment_delivery_idx` ON `commit_comment` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `create` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`ref` text,
	`ref_type` text,
	`master_branch` text,
	`pusher_type` text,
	`description` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `create_delivery_idx` ON `create` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `custom_property` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`definition_id` integer,
	`property_name` text,
	`value_type` text,
	`default_value` text,
	`required` integer,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `custom_property_delivery_idx` ON `custom_property` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `custom_property_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`repository_id` integer,
	`repository_name` text,
	`organization_id` integer,
	`new_values` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `custom_property_values_delivery_idx` ON `custom_property_values` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `daily_trends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`trend_summary` text NOT NULL,
	`top_picks` text NOT NULL,
	`sent_in_email` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `daily_trends_date_idx` ON `daily_trends` (`date`);--> statement-breakpoint
CREATE TABLE `delete` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`ref` text,
	`ref_type` text,
	`pusher_type` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `delete_delivery_idx` ON `delete` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `dependabot_alert` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`alert_number` integer,
	`state` text,
	`dependency_package` text,
	`security_advisory_id` text,
	`severity` text,
	`dismissed_reason` text,
	`dismissed_at` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dependabot_alert_delivery_idx` ON `dependabot_alert` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `dismissal_request_code_scanning` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`alert_number` integer,
	`request_id` integer,
	`reason` text,
	`requested_by` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dismissal_request_code_scanning_delivery_idx` ON `dismissal_request_code_scanning` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `dismissal_request_secret_scanning` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`alert_number` integer,
	`request_id` integer,
	`reason` text,
	`requested_by` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dismissal_request_secret_scanning_delivery_idx` ON `dismissal_request_secret_scanning` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `exemption_request_push_ruleset` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`request_id` integer,
	`ruleset_id` integer,
	`ruleset_name` text,
	`status` text,
	`requester_login` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `exemption_request_push_ruleset_delivery_idx` ON `exemption_request_push_ruleset` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `exemption_request_secret_scanning` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`request_id` integer,
	`status` text,
	`resource_identifier` text,
	`requester_login` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `exemption_request_secret_scanning_delivery_idx` ON `exemption_request_secret_scanning` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `fork` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`forkee_id` integer,
	`forkee_name` text,
	`forkee_full_name` text,
	`forkee_owner_login` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fork_delivery_idx` ON `fork` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `issue_comment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`issue_number` integer,
	`comment_id` integer,
	`action` text,
	`author_login` text,
	`body` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `issue_comment_delivery_idx` ON `issue_comment` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`issue_number` integer,
	`title` text,
	`state` text,
	`author_login` text,
	`assignee_login` text,
	`milestone_id` integer,
	`created_at` text,
	`closed_at` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `issues_delivery_idx` ON `issues` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `label` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`label_id` integer,
	`name` text,
	`color` text,
	`description` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `label_delivery_idx` ON `label` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `merge_queue_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`queue_entry_id` text,
	`pr_number` integer,
	`queue_position` integer,
	`state` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `merge_queue_entry_delivery_idx` ON `merge_queue_entry` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `milestone` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`milestone_id` integer,
	`number` integer,
	`title` text,
	`state` text,
	`due_on` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `milestone_delivery_idx` ON `milestone` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `org_block` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`blocked_user_login` text,
	`blocked_reason` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `org_block_delivery_idx` ON `org_block` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `organization_custom_property_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`organization_id` integer,
	`repository_id` integer,
	`property_name` text,
	`new_value` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `organization_custom_property_values_delivery_idx` ON `organization_custom_property_values` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `pull_request` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`pr_number` integer,
	`title` text,
	`state` text,
	`head_ref` text,
	`head_sha` text,
	`base_ref` text,
	`base_sha` text,
	`merged` integer,
	`merged_at` text,
	`author_login` text,
	`assignee_login` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pull_request_delivery_idx` ON `pull_request` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `pull_request_review` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`review_id` integer,
	`pr_number` integer,
	`state` text,
	`author_login` text,
	`submitted_at` text,
	`body` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pull_request_review_delivery_idx` ON `pull_request_review` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `pull_request_review_comment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`comment_id` integer,
	`pr_number` integer,
	`review_id` integer,
	`commit_id` text,
	`path` text,
	`line` integer,
	`body` text,
	`author_login` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pull_request_review_comment_delivery_idx` ON `pull_request_review_comment` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `pull_request_review_thread` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`thread_id` text,
	`pr_number` integer,
	`is_resolved` integer,
	`author_login` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pull_request_review_thread_delivery_idx` ON `pull_request_review_thread` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `push` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`ref` text,
	`before_sha` text,
	`after_sha` text,
	`pusher_name` text,
	`head_commit_id` text,
	`head_commit_message` text,
	`size` integer,
	`distinct_size` integer,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `push_delivery_idx` ON `push` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `repo_analysis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`search_id` integer NOT NULL,
	`session_id` text NOT NULL,
	`repo_full_name` text NOT NULL,
	`repo_url` text NOT NULL,
	`description` text,
	`relevancy_score` real NOT NULL,
	`reasoning` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`search_id`) REFERENCES `searches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `repository` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`repository_id` integer,
	`name` text,
	`full_name` text,
	`visibility` text,
	`owner_login` text,
	`description` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `repository_delivery_idx` ON `repository` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `repository_advisory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`ghsa_id` text,
	`summary` text,
	`severity` text,
	`state` text,
	`published_at` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `repository_advisory_delivery_idx` ON `repository_advisory` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `research_judge_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`query` text NOT NULL,
	`is_relevant` integer NOT NULL,
	`ai_features` text NOT NULL,
	`summary` text NOT NULL,
	`confidence_score` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `searches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`search_term` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now'))
);
--> statement-breakpoint
CREATE TABLE `secret_scanning_alert` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`alert_number` integer,
	`secret_type` text,
	`resolution` text,
	`state` text,
	`created_at` text,
	`resolved_at` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `secret_scanning_alert_delivery_idx` ON `secret_scanning_alert` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `secret_scanning_alert_location` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`alert_number` integer,
	`location_type` text,
	`commit_sha` text,
	`start_line` integer,
	`end_line` integer,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `secret_scanning_alert_location_delivery_idx` ON `secret_scanning_alert_location` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `secret_scanning_scan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`type` text,
	`status` text,
	`completed_at` text,
	`secret_types_count` integer,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `secret_scanning_scan_delivery_idx` ON `secret_scanning_scan` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `security_advisory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`ghsa_id` text,
	`summary` text,
	`severity` text,
	`published_at` text,
	`updated_at` text,
	`withdrawn_at` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `security_advisory_delivery_idx` ON `security_advisory` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `security_and_analysis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`repository_id` integer,
	`changes_from` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `security_and_analysis_delivery_idx` ON `security_and_analysis` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `star` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`starred_at` text,
	`repository_id` integer,
	`sender_login` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `star_delivery_idx` ON `star` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `status` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`sha` text,
	`state` text,
	`context` text,
	`description` text,
	`target_url` text,
	`commit_url` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `status_delivery_idx` ON `status` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `sub_issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`parent_issue_id` integer,
	`sub_issue_id` integer,
	`sub_issue_title` text,
	`parent_issue_title` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sub_issues_delivery_idx` ON `sub_issues` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `trending_repos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_uuid` text NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`ai_analysis` text,
	`why_justin_interested` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trending_repos_url_unique` ON `trending_repos` (`url`);--> statement-breakpoint
CREATE INDEX `trending_repos_url_idx` ON `trending_repos` (`url`);--> statement-breakpoint
CREATE INDEX `trending_repos_created_at_idx` ON `trending_repos` (`created_at`);--> statement-breakpoint
CREATE TABLE `watch` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`repository_id` integer,
	`sender_login` text,
	`action` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `watch_delivery_idx` ON `watch` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_id` text NOT NULL,
	`event` text NOT NULL,
	`action` text,
	`repo_full_name` text,
	`signature_sha256` text NOT NULL,
	`user_agent` text,
	`content_type` text,
	`payload` text NOT NULL,
	`summary_payload` text,
	`hook_id` integer,
	`installation_id` integer,
	`installation_type` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_deliveries_delivery_id_unique` ON `webhook_deliveries` (`delivery_id`);--> statement-breakpoint
CREATE INDEX `delivery_idx` ON `webhook_deliveries` (`delivery_id`);--> statement-breakpoint
CREATE INDEX `event_idx` ON `webhook_deliveries` (`event`);--> statement-breakpoint
CREATE INDEX `created_at_idx` ON `webhook_deliveries` (`created_at`);--> statement-breakpoint
CREATE INDEX `repo_full_name_idx` ON `webhook_deliveries` (`repo_full_name`);--> statement-breakpoint
CREATE TABLE `workflow_dispatch` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`workflow` text,
	`ref` text,
	`sender_login` text,
	`inputs` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workflow_dispatch_delivery_idx` ON `workflow_dispatch` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `workflow_job` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`job_id` integer,
	`run_id` integer,
	`workflow_name` text,
	`status` text,
	`conclusion` text,
	`started_at` text,
	`completed_at` text,
	`runner_group_name` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workflow_job_delivery_idx` ON `workflow_job` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `workflow_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`run_id` integer,
	`workflow_id` integer,
	`workflow_name` text,
	`head_branch` text,
	`head_sha` text,
	`status` text,
	`conclusion` text,
	`event` text,
	`run_attempt` integer,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workflow_run_delivery_idx` ON `workflow_run` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `jules_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`planning_request_id` text,
	`agent_id` text,
	`specialist_class` text,
	`session_role` text,
	`prompt` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`repo_owner` text,
	`repo_name` text,
	`branch` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`last_activity_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`webhook_received_at` integer,
	`assistance_count` integer DEFAULT 0,
	`requires_user_attention` integer DEFAULT false,
	`metadata_json` text
);
--> statement-breakpoint
CREATE INDEX `jules_sessions_status_idx` ON `jules_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `jules_sessions_project_idx` ON `jules_sessions` (`project_id`);--> statement-breakpoint
CREATE INDEX `jules_sessions_planning_request_idx` ON `jules_sessions` (`planning_request_id`);--> statement-breakpoint
CREATE INDEX `jules_sessions_agent_idx` ON `jules_sessions` (`agent_id`);--> statement-breakpoint
CREATE INDEX `jules_sessions_created_idx` ON `jules_sessions` (`created_at`);--> statement-breakpoint
CREATE INDEX `jules_sessions_last_activity_idx` ON `jules_sessions` (`last_activity_at`);--> statement-breakpoint
CREATE TABLE `jules_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`repo_full_name` text NOT NULL,
	`prompt` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jules_jobs_status_idx` ON `jules_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `jules_jobs_session_id_idx` ON `jules_jobs` (`session_id`);--> statement-breakpoint
CREATE TABLE `jules_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`jules_session_id` text NOT NULL,
	`planning_request_id` text,
	`session_role` text,
	`event_type` text NOT NULL,
	`message` text NOT NULL,
	`progress_pct` integer,
	`step_name` text,
	`raw_payload` text,
	`handled_at` integer,
	`handled_by` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jwh_session_idx` ON `jules_webhook_events` (`jules_session_id`);--> statement-breakpoint
CREATE INDEX `jwh_planning_request_idx` ON `jules_webhook_events` (`planning_request_id`);--> statement-breakpoint
CREATE INDEX `jwh_event_type_idx` ON `jules_webhook_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `jwh_created_idx` ON `jules_webhook_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_id` text NOT NULL,
	`repo_full_name` text NOT NULL,
	`trigger_event` text NOT NULL,
	`analysis_detail` text NOT NULL,
	`action_taken` text NOT NULL,
	`verification_status` text NOT NULL,
	`verification_reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_delivery_idx` ON `audit_logs` (`delivery_id`);--> statement-breakpoint
CREATE INDEX `audit_repo_idx` ON `audit_logs` (`repo_full_name`);--> statement-breakpoint
CREATE INDEX `audit_event_idx` ON `audit_logs` (`trigger_event`);--> statement-breakpoint
CREATE TABLE `health_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`details` text,
	`duration_ms` integer DEFAULT 0,
	`ai_suggestion` text,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`run_id`) REFERENCES `health_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `health_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`trigger` text DEFAULT 'manual',
	`duration_ms` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `health_test_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`target` text NOT NULL,
	`method` text DEFAULT 'GET',
	`expected_status` integer DEFAULT 200,
	`frequency_seconds` integer DEFAULT 604800,
	`criticality` text DEFAULT 'medium',
	`enabled` integer DEFAULT true,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_test_definitions_name_unique` ON `health_test_definitions` (`name`);--> statement-breakpoint
CREATE TABLE `request_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`payload_size_bytes` integer NOT NULL,
	`correlation_id` text NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `system_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`meta` text,
	`source_file` text NOT NULL,
	`line_number` integer NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `system_logs_timestamp_idx` ON `system_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `system_logs_level_idx` ON `system_logs` (`level`);--> statement-breakpoint
CREATE INDEX `system_logs_source_idx` ON `system_logs` (`source_file`);--> statement-breakpoint
CREATE TABLE `secrets_config` (
	`name` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `project_phases` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'pending',
	`start_date` text,
	`end_date` text,
	`success_criteria` text,
	`technical_instructions` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_phases_project` ON `project_phases` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'planning',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`owner` text,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_projects_repo` ON `projects` (`repo_id`);--> statement-breakpoint
CREATE TABLE `project_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`parent_id` text,
	`item_type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`assignee` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	`metadata_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "project_plans_item_type_check" CHECK("project_plans"."item_type" in ('epic', 'story', 'task')),
	CONSTRAINT "project_plans_status_check" CHECK("project_plans"."status" in ('todo', 'in_progress', 'blocked', 'done')),
	CONSTRAINT "project_plans_priority_check" CHECK("project_plans"."priority" in ('low', 'medium', 'high', 'critical'))
);
--> statement-breakpoint
CREATE INDEX `idx_project_plans_project` ON `project_plans` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_plans_parent` ON `project_plans` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_project_plans_type_status` ON `project_plans` (`item_type`,`status`);--> statement-breakpoint
CREATE TABLE `planning_request_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`artifact_kind` text NOT NULL,
	`storage_driver` text NOT NULL,
	`storage_key` text,
	`mime_type` text,
	`content_text` text,
	`metadata_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `planning_request_artifacts_request_idx` ON `planning_request_artifacts` (`request_id`);--> statement-breakpoint
CREATE INDEX `planning_request_artifacts_kind_idx` ON `planning_request_artifacts` (`artifact_kind`);--> statement-breakpoint
CREATE INDEX `planning_request_artifacts_driver_idx` ON `planning_request_artifacts` (`storage_driver`);--> statement-breakpoint
CREATE INDEX `planning_request_artifacts_created_idx` ON `planning_request_artifacts` (`created_at`);--> statement-breakpoint
CREATE TABLE `planning_request_events` (
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
CREATE INDEX `planning_request_events_request_idx` ON `planning_request_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `planning_request_events_source_idx` ON `planning_request_events` (`source`);--> statement-breakpoint
CREATE INDEX `planning_request_events_type_idx` ON `planning_request_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `planning_request_events_created_idx` ON `planning_request_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `planning_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`github_repo_owner` text,
	`github_repo_name` text,
	`original_prompt` text NOT NULL,
	`upscaled_prompt` text
);
--> statement-breakpoint
CREATE TABLE `reverse_eng_backend` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`architecture_markdown` text,
	`endpoint_inventory_json` text,
	`data_model_json` text,
	`integrations_json` text,
	`auth_model_json` text,
	`deployment_model_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `reverse_eng_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reverse_eng_backend_snapshot_idx` ON `reverse_eng_backend` (`snapshot_id`);--> statement-breakpoint
CREATE TABLE `reverse_eng_events` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`event_type` text NOT NULL,
	`title` text,
	`message` text,
	`payload_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `reverse_eng_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reverse_eng_events_snapshot_idx` ON `reverse_eng_events` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `reverse_eng_events_event_idx` ON `reverse_eng_events` (`event_type`);--> statement-breakpoint
CREATE TABLE `reverse_eng_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`github_owner` text NOT NULL,
	`github_repo` text NOT NULL,
	`repo_url` text NOT NULL,
	`branch` text DEFAULT 'main' NOT NULL,
	`frontend_url` text,
	`resolved_preview_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`title` text,
	`detected_stack_json` text,
	`preview_resolution_json` text,
	`frontend_auth_json` text,
	`requested_auth_json` text,
	`screenshot_urls_json` text,
	`prd_markdown` text,
	`epics_json` text,
	`user_journeys_json` text,
	`repo_research_json` text,
	`jules_research_json` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "reverse_eng_snapshots_status_check" CHECK("reverse_eng_snapshots"."status" in ('pending', 'running', 'awaiting_auth', 'complete', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `reverse_eng_snapshots_project_idx` ON `reverse_eng_snapshots` (`project_id`);--> statement-breakpoint
CREATE INDEX `reverse_eng_snapshots_repo_idx` ON `reverse_eng_snapshots` (`github_owner`,`github_repo`);--> statement-breakpoint
CREATE INDEX `reverse_eng_snapshots_status_idx` ON `reverse_eng_snapshots` (`status`);--> statement-breakpoint
CREATE TABLE `reverse_eng_ux` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`overall_description` text,
	`page_analyses_json` text,
	`screenshot_gallery_json` text,
	`page_user_journeys_json` text,
	`vision_analysis_json` text,
	`code_analysis_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `reverse_eng_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reverse_eng_ux_snapshot_idx` ON `reverse_eng_ux` (`snapshot_id`);--> statement-breakpoint
CREATE TABLE `task_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`content` text NOT NULL,
	`author` text NOT NULL,
	`github_comment_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_comments_task` ON `task_comments` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`github_issue_id` integer,
	`request_id` text,
	`event_type` text NOT NULL,
	`object_type` text,
	`field_name` text,
	`old_value` text,
	`new_value` text,
	`status` text NOT NULL,
	`details` text,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_events_task` ON `task_events` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_events_req` ON `task_events` (`request_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'backlog' NOT NULL,
	`priority` text DEFAULT 'low' NOT NULL,
	`assignee` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`position` integer DEFAULT 0,
	`start_at` text,
	`end_at` text,
	`group_name` text,
	`product_name` text,
	`initiative_name` text,
	`release_name` text,
	`is_deleted` integer DEFAULT 0,
	`github_issue_id` integer,
	`github_html_url` text,
	`phase_id` text,
	`kanban_column` text DEFAULT 'backlog' NOT NULL,
	CONSTRAINT "status_check" CHECK("tasks"."status" IN ('backlog','todo','in_progress','review','done')),
	CONSTRAINT "kanban_check" CHECK("tasks"."kanban_column" IN ('backlog','planned','in_progress','done')),
	CONSTRAINT "priority_check" CHECK("tasks"."priority" IN ('low','medium','high','critical'))
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_repo` ON `tasks` (`repo_id`);--> statement-breakpoint
CREATE TABLE `corkboard_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`pos_x` real DEFAULT 60,
	`pos_y` real DEFAULT 20,
	`rotation` real DEFAULT 0,
	`is_deleted` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `todo_ai_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`todo_id` text NOT NULL,
	`insight` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending_hil' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "insight_status_check" CHECK("todo_ai_insights"."status" IN ('pending_hil','done','rejected'))
);
--> statement-breakpoint
CREATE INDEX `idx_insights_todo` ON `todo_ai_insights` (`todo_id`);--> statement-breakpoint
CREATE TABLE `todo_links` (
	`id` text PRIMARY KEY NOT NULL,
	`todo_id` text NOT NULL,
	`href` text NOT NULL,
	`url` text,
	`content` text,
	`crawled_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_links_todo` ON `todo_links` (`todo_id`);--> statement-breakpoint
CREATE TABLE `todo_tag_map` (
	`todo_id` text NOT NULL,
	`tag_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pk_todo_tag_map` ON `todo_tag_map` (`todo_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `idx_tag_map_todo` ON `todo_tag_map` (`todo_id`);--> statement-breakpoint
CREATE INDEX `idx_tag_map_tag` ON `todo_tag_map` (`tag_id`);--> statement-breakpoint
CREATE TABLE `todo_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#94a3b8',
	`description` text,
	`is_deleted` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `todo_tags_name_unique` ON `todo_tags` (`name`);--> statement-breakpoint
CREATE TABLE `todos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`content` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` text DEFAULT 'normal',
	`position` integer DEFAULT 0,
	`is_deleted` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`completed_at` text,
	`pos_x` real DEFAULT 40,
	`pos_y` real DEFAULT 40,
	`rotation` real DEFAULT 0,
	`note_color` text DEFAULT '#fde68a',
	`is_active` integer DEFAULT 1,
	`date_completed` text,
	CONSTRAINT "todo_status_check" CHECK("todos"."status" IN ('pending','done','archived'))
);
--> statement-breakpoint
CREATE TABLE `pm_epics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo',
	`priority` text DEFAULT 'medium',
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `pm_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pm_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo',
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `pm_stories` (
	`id` text PRIMARY KEY NOT NULL,
	`epic_id` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo',
	`priority` text DEFAULT 'medium',
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`epic_id`) REFERENCES `pm_epics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pm_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo',
	`priority` text DEFAULT 'medium',
	`order` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`story_id`) REFERENCES `pm_stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workshop_task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`type` text NOT NULL,
	`actor` text NOT NULL,
	`content` text,
	`status` text DEFAULT 'pending',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `workshop_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `workshop_project_tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `automation_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`repo` text NOT NULL,
	`automation_class` text NOT NULL,
	`status` text NOT NULL,
	`details` text,
	`pr_or_issue_number` integer,
	`delivery_id` text,
	`event_name` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_class` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`use_pat` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_configs_automation_class_unique` ON `webhook_configs` (`automation_class`);--> statement-breakpoint
CREATE TABLE `daily_research_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`prompt` text NOT NULL,
	`status` text NOT NULL,
	`judge_notes` text,
	`findings` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workshop_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`repo_url` text,
	`status` text DEFAULT 'draft',
	`draft_data` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `workshop_project_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`project_name` text NOT NULL,
	`generated_date` text NOT NULL,
	`total_phases` integer NOT NULL,
	`phases` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `workshop_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workshop_agent_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`content` text NOT NULL,
	`vectorize_id` text,
	`conflict_status` text DEFAULT 'none',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `workshop_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workshop_ux_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`phase` text DEFAULT 'idle' NOT NULL,
	`original_prompt` text NOT NULL,
	`enhanced_prompt` text,
	`design_md` text,
	`stitch_project_id` text,
	`enhance_jules_session_id` text,
	`design_jules_session_id` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `workshop_ux_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`page_name` text NOT NULL,
	`page_title` text NOT NULL,
	`page_prompt` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`review_iterations` integer DEFAULT 0 NOT NULL,
	`review_score` integer,
	`stitch_screen_id` text,
	`stitch_html` text,
	`stitch_screenshot_url` text,
	`github_html_path` text,
	`github_screenshot_path` text,
	`github_commit_sha` text,
	`jules_session_id` text,
	`jules_pr_url` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `plan_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`planning_request_id` text NOT NULL,
	`prompt` text NOT NULL,
	`response` text NOT NULL,
	FOREIGN KEY (`planning_request_id`) REFERENCES `planning_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `planning_requests_upscaling` (
	`id` text PRIMARY KEY NOT NULL,
	`planning_request_id` text NOT NULL,
	`task` text NOT NULL,
	`details` text NOT NULL,
	FOREIGN KEY (`planning_request_id`) REFERENCES `planning_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pr_review_checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`planning_request_id` text NOT NULL,
	`pr_url` text NOT NULL,
	`item` text NOT NULL,
	`status` text NOT NULL,
	`iteration` integer NOT NULL,
	FOREIGN KEY (`planning_request_id`) REFERENCES `planning_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workshop_ux_task_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`task_name` text NOT NULL,
	`task_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `workshop_ux_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
