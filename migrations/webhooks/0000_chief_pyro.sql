CREATE TABLE IF NOT EXISTS `check_run` (
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
CREATE TABLE IF NOT EXISTS `code_scanning_alert` (
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
CREATE TABLE IF NOT EXISTS `commit_comment` (
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
CREATE TABLE IF NOT EXISTS `create` (
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
CREATE TABLE IF NOT EXISTS `custom_property` (
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
CREATE TABLE IF NOT EXISTS `custom_property_values` (
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
CREATE TABLE IF NOT EXISTS `delete` (
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
CREATE TABLE IF NOT EXISTS `dependabot_alert` (
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
CREATE TABLE IF NOT EXISTS `dismissal_request_code_scanning` (
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
CREATE TABLE IF NOT EXISTS `dismissal_request_secret_scanning` (
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
CREATE TABLE IF NOT EXISTS `exemption_request_push_ruleset` (
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
CREATE TABLE IF NOT EXISTS `exemption_request_secret_scanning` (
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
CREATE TABLE IF NOT EXISTS `fork` (
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
CREATE TABLE IF NOT EXISTS `issue_comment` (
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
CREATE TABLE IF NOT EXISTS `issues` (
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
CREATE TABLE IF NOT EXISTS `label` (
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
CREATE TABLE IF NOT EXISTS `merge_queue_entry` (
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
CREATE TABLE IF NOT EXISTS `milestone` (
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
CREATE TABLE IF NOT EXISTS `org_block` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`blocked_user_login` text,
	`blocked_reason` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `org_block_delivery_idx` ON `org_block` (`delivery_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `organization_custom_property_values` (
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
CREATE TABLE IF NOT EXISTS `pull_request` (
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
CREATE TABLE IF NOT EXISTS `pull_request_review` (
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
CREATE TABLE IF NOT EXISTS `pull_request_review_comment` (
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
CREATE TABLE IF NOT EXISTS `pull_request_review_thread` (
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
CREATE TABLE IF NOT EXISTS `push` (
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
CREATE TABLE IF NOT EXISTS `repository` (
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
CREATE TABLE IF NOT EXISTS `repository_advisory` (
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
CREATE TABLE IF NOT EXISTS `secret_scanning_alert` (
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
CREATE TABLE IF NOT EXISTS `secret_scanning_alert_location` (
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
CREATE TABLE IF NOT EXISTS `secret_scanning_scan` (
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
CREATE TABLE IF NOT EXISTS `security_advisory` (
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
CREATE TABLE IF NOT EXISTS `security_and_analysis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` text NOT NULL,
	`payload` text NOT NULL,
	`repository_id` integer,
	`changes_from` text,
	FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`delivery_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `security_and_analysis_delivery_idx` ON `security_and_analysis` (`delivery_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `star` (
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
CREATE TABLE IF NOT EXISTS `status` (
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
CREATE TABLE IF NOT EXISTS `sub_issues` (
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
CREATE TABLE IF NOT EXISTS `watch` (
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
CREATE TABLE IF NOT EXISTS `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_id` text NOT NULL,
	`event` text NOT NULL,
	`action` text,
	`signature_sha256` text NOT NULL,
	`user_agent` text,
	`content_type` text,
	`payload` text NOT NULL,
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
CREATE TABLE IF NOT EXISTS `workflow_dispatch` (
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
CREATE TABLE IF NOT EXISTS `workflow_job` (
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
CREATE TABLE IF NOT EXISTS `workflow_run` (
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
CREATE INDEX `workflow_run_delivery_idx` ON `workflow_run` (`delivery_id`);