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
ALTER TABLE `health_results` ADD `ai_suggestion` text;