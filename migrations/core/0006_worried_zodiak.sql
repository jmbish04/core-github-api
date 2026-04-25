CREATE TABLE `agent_function_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_name` text NOT NULL,
	`function_name` text NOT NULL,
	`label` text,
	`primary_provider` text DEFAULT 'gemini',
	`primary_model` text DEFAULT 'gemini-2.0-flash',
	`secondary_provider` text DEFAULT 'worker-ai',
	`secondary_model` text DEFAULT '@cf/meta/llama-3.1-8b-instruct',
	`system_instructions` text,
	`prompt_template` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`updated_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_function_configs_agent_idx` ON `agent_function_configs` (`agent_name`);--> statement-breakpoint
CREATE INDEX `agent_function_configs_active_idx` ON `agent_function_configs` (`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_function_configs_uniq` ON `agent_function_configs` (`agent_name`,`function_name`);