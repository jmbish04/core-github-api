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
CREATE TABLE `retrofit_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`draft_prompt_id` integer NOT NULL,
	`draft_prompt_version` integer NOT NULL,
	`user_comment` text NOT NULL,
	`ai_updated_language` text,
	`resolved` integer DEFAULT false,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`draft_prompt_id`) REFERENCES `retrofit_prompts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `retrofit_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`thread_id`) REFERENCES `retrofit_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `retrofit_prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`prompt_content` text NOT NULL,
	`previous_prompt_id` integer,
	`message_id` integer,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`thread_id`) REFERENCES `retrofit_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `retrofit_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `retrofit_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`source_repo` text NOT NULL,
	`destination_repo` text,
	`status` text DEFAULT 'drafting' NOT NULL,
	`jules_session_id` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	`updated_at` integer DEFAULT (strftime('%s', 'now'))
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
CREATE INDEX `discord_scan_log_guild_id_idx` ON `discord_scan_log` (`guild_id`);