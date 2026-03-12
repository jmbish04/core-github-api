ALTER TABLE `research_candidates` ADD `metadata` text;
--> statement-breakpoint
CREATE TABLE `discord_research_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`guild_id` text NOT NULL,
	`channels` text,
	`prompt` text,
	`cron_schedule` text,
	`is_active` integer DEFAULT true,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	`updated_at` integer DEFAULT (strftime('%s', 'now'))
);
--> statement-breakpoint
CREATE TABLE `discord_scan_watermarks` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`last_message_id` text,
	`last_message_timestamp` text,
	`updated_at` integer DEFAULT (strftime('%s', 'now'))
);
