CREATE TABLE IF NOT EXISTS `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`url` text,
	`github_repo` text,
	`description` text,
	`summary` text,
	`last_deployed_date` integer,
	`last_traffic_date` integer,
	`last_build_date` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`hex_color` text DEFAULT '#3b82f6',
	`is_active` integer DEFAULT true,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tag_application_mapping` (
	`app_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT '"2026-02-20T09:38:03.032Z"' NOT NULL,
	PRIMARY KEY(`app_id`, `tag_id`),
	FOREIGN KEY (`app_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
