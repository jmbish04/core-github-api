ALTER TABLE `golden_path_config` ADD `severity` text DEFAULT 'warning' NOT NULL;--> statement-breakpoint
ALTER TABLE `golden_path_config` ADD `pattern` text;--> statement-breakpoint
ALTER TABLE `golden_path_config` ADD `pattern_type` text DEFAULT 'string';--> statement-breakpoint
ALTER TABLE `golden_path_config` ADD `docs_url` text;--> statement-breakpoint
ALTER TABLE `golden_path_config` ADD `is_active` integer DEFAULT true NOT NULL;