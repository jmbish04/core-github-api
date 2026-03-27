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
CREATE UNIQUE INDEX `system_config_definitions_config_key_unique` ON `system_config_definitions` (`config_key`);