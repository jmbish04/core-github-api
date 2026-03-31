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
CREATE INDEX `discord_scan_log_guild_id_idx` ON `discord_scan_log` (`guild_id`);--> statement-breakpoint
CREATE TABLE `workshop_ux_task_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`task_name` text NOT NULL,
	`task_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `workshop_ux_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
