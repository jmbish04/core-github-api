PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_function_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_name` text NOT NULL,
	`function_name` text NOT NULL,
	`label` text,
	`primary_provider` text DEFAULT 'gemini',
	`primary_model` text DEFAULT 'gemini-2.0-flash',
	`secondary_provider` text DEFAULT 'worker-ai',
	`secondary_model` text DEFAULT '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
	`system_instructions` text,
	`prompt_template` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`updated_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_agent_function_configs`("id", "agent_name", "function_name", "label", "primary_provider", "primary_model", "secondary_provider", "secondary_model", "system_instructions", "prompt_template", "notes", "is_active", "updated_at", "created_at") SELECT "id", "agent_name", "function_name", "label", "primary_provider", "primary_model", "secondary_provider", "secondary_model", "system_instructions", "prompt_template", "notes", "is_active", "updated_at", "created_at" FROM `agent_function_configs`;--> statement-breakpoint
DROP TABLE `agent_function_configs`;--> statement-breakpoint
ALTER TABLE `__new_agent_function_configs` RENAME TO `agent_function_configs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `agent_function_configs_agent_idx` ON `agent_function_configs` (`agent_name`);--> statement-breakpoint
CREATE INDEX `agent_function_configs_active_idx` ON `agent_function_configs` (`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_function_configs_uniq` ON `agent_function_configs` (`agent_name`,`function_name`);