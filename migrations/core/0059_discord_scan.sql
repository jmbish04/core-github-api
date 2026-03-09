-- Migration: 0059_discord_scan
-- Adds tables for incremental Discord channel scanning and message storage.
-- These tables power the DiscordResearchWorkflow which ingests messages from
-- the Cloudflare Developers Discord, de-duplicates them, and routes them
-- through the AI analysis pipeline before including findings in the daily
-- newsletter.

CREATE TABLE `discord_scan_log` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL UNIQUE,
	`channel_name` text,
	`last_message_id` text,
	`last_scanned_at` integer NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);

CREATE INDEX `discord_scan_log_guild_id_idx` ON `discord_scan_log` (`guild_id`);

CREATE TABLE `discord_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_name` text,
	`author_id` text,
	`author_username` text,
	`content` text NOT NULL,
	`discord_timestamp` text NOT NULL,
	`category` text NOT NULL DEFAULT 'general',
	`ai_score` integer,
	`ai_summary` text,
	`analysed` integer NOT NULL DEFAULT 0,
	`ingested_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);

CREATE INDEX `discord_messages_channel_id_idx` ON `discord_messages` (`channel_id`);
CREATE INDEX `discord_messages_guild_id_idx` ON `discord_messages` (`guild_id`);
CREATE INDEX `discord_messages_category_idx` ON `discord_messages` (`category`);
CREATE INDEX `discord_messages_analysed_idx` ON `discord_messages` (`analysed`);
