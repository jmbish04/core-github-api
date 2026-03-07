-- Migration: Add pricing_change_log table
-- Created: 2026-03-02
-- Description: Track pricing changes over time for AI models

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
CREATE INDEX `pricing_change_type_idx` ON `pricing_change_log` (`change_type`);
