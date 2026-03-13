CREATE TABLE IF NOT EXISTS `pricing_change_log` (
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
CREATE INDEX IF NOT EXISTS `pricing_change_provider_idx` ON `pricing_change_log` (`provider`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pricing_change_model_id_idx` ON `pricing_change_log` (`model_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pricing_change_detected_at_idx` ON `pricing_change_log` (`detected_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pricing_change_type_idx` ON `pricing_change_log` (`change_type`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `standardization_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`rule` text NOT NULL,
	`timestamp_created` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`timestamp_modified` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`timestamp_inactive` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `standardization_tag_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`hex_color` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `standardization_tag_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`tag_id` text NOT NULL,
	`standardization_item_id` text NOT NULL,
	FOREIGN KEY (`tag_id`) REFERENCES `standardization_tag_definitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`standardization_item_id`) REFERENCES `standardization_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `automation_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`repo` text NOT NULL,
	`automation_class` text NOT NULL,
	`status` text NOT NULL,
	`details` text,
	`pr_or_issue_number` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `webhook_configs` (	
	`id` text PRIMARY KEY NOT NULL,
	`automation_class` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`use_pat` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `webhook_configs_automation_class_unique` ON `webhook_configs` (`automation_class`);