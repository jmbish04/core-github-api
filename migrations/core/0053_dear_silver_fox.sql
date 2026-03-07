CREATE TABLE `corkboard_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`pos_x` real DEFAULT 60,
	`pos_y` real DEFAULT 20,
	`rotation` real DEFAULT 0,
	`is_deleted` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE `todos` ADD `pos_x` real DEFAULT 40;--> statement-breakpoint
ALTER TABLE `todos` ADD `pos_y` real DEFAULT 40;--> statement-breakpoint
ALTER TABLE `todos` ADD `rotation` real DEFAULT 0;--> statement-breakpoint
ALTER TABLE `todos` ADD `note_color` text DEFAULT '#fde68a';--> statement-breakpoint
ALTER TABLE `todos` ADD `is_active` integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE `todos` ADD `date_completed` text;