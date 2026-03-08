CREATE TABLE IF NOT EXISTS `workshop_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`repo_url` text,
	`status` text DEFAULT 'draft',
	`draft_data` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `workshop_project_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`phase_number` integer NOT NULL,
	`phase_title` text NOT NULL,
	`task_number` integer NOT NULL,
	`task_title` text NOT NULL,
	`task_description` text,
	`status` text DEFAULT 'not_started',
	`agent_assigned` text,
	`requirements` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `workshop_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `workshop_task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text,
	`type` text NOT NULL,
	`actor` text NOT NULL,
	`content` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`project_id`) REFERENCES `workshop_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `workshop_project_tasks`(`id`) ON UPDATE no action ON DELETE set null
);
