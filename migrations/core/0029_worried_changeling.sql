CREATE TABLE IF NOT EXISTS `pm_epics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo',
	`priority` text DEFAULT 'medium',
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `pm_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pm_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo',
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pm_stories` (
	`id` text PRIMARY KEY NOT NULL,
	`epic_id` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo',
	`priority` text DEFAULT 'medium',
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`epic_id`) REFERENCES `pm_epics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pm_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo',
	`priority` text DEFAULT 'medium',
	`order` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`story_id`) REFERENCES `pm_stories`(`id`) ON UPDATE no action ON DELETE cascade
);
