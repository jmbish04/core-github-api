CREATE TABLE `secrets_config` (
	`name` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`description` text
);
--> statement-breakpoint
ALTER TABLE `project_favorites` ADD `project_id` text;--> statement-breakpoint
ALTER TABLE `project_favorites` ADD `is_active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `project_favorites` ADD `time_favorited` text;--> statement-breakpoint
ALTER TABLE `project_favorites` ADD `time_unfavorited` text;--> statement-breakpoint
ALTER TABLE `project_favorites` ADD `updated_at` text;