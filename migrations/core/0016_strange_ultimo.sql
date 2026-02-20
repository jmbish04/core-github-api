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
CREATE INDEX `idx_user_settings_provider` ON `user_settings` (`preferred_provider`);