CREATE TABLE `todo_ai_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`todo_id` text NOT NULL,
	`insight` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending_hil' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "insight_status_check" CHECK("todo_ai_insights"."status" IN ('pending_hil','done','rejected'))
);
--> statement-breakpoint
CREATE INDEX `idx_insights_todo` ON `todo_ai_insights` (`todo_id`);--> statement-breakpoint
CREATE TABLE `todo_links` (
	`id` text PRIMARY KEY NOT NULL,
	`todo_id` text NOT NULL,
	`href` text NOT NULL,
	`url` text,
	`content` text,
	`crawled_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_links_todo` ON `todo_links` (`todo_id`);--> statement-breakpoint
CREATE TABLE `todo_tag_map` (
	`todo_id` text NOT NULL,
	`tag_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pk_todo_tag_map` ON `todo_tag_map` (`todo_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `idx_tag_map_todo` ON `todo_tag_map` (`todo_id`);--> statement-breakpoint
CREATE INDEX `idx_tag_map_tag` ON `todo_tag_map` (`tag_id`);--> statement-breakpoint
CREATE TABLE `todo_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#94a3b8',
	`description` text,
	`is_deleted` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `todo_tags_name_unique` ON `todo_tags` (`name`);--> statement-breakpoint
CREATE TABLE `todos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`content` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` text DEFAULT 'normal',
	`position` integer DEFAULT 0,
	`is_deleted` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`completed_at` text,
	CONSTRAINT "todo_status_check" CHECK("todos"."status" IN ('pending','done','archived'))
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'backlog' NOT NULL,
	`priority` text DEFAULT 'low' NOT NULL,
	`assignee` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	`position` integer DEFAULT 0,
	`start_at` text,
	`end_at` text,
	`group_name` text,
	`product_name` text,
	`initiative_name` text,
	`release_name` text,
	`is_deleted` integer DEFAULT 0,
	`github_issue_id` integer,
	`github_html_url` text,
	`kanban_column` text DEFAULT 'backlog' NOT NULL,
	CONSTRAINT "status_check" CHECK("__new_tasks"."status" IN ('backlog','todo','in_progress','review','done')),
	CONSTRAINT "kanban_check" CHECK("__new_tasks"."kanban_column" IN ('backlog','planned','in_progress','done')),
	CONSTRAINT "priority_check" CHECK("__new_tasks"."priority" IN ('low','medium','high','critical'))
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "repo_id", "title", "description", "status", "priority", "assignee", "created_at", "updated_at", "position", "start_at", "end_at", "group_name", "product_name", "initiative_name", "release_name", "is_deleted", "github_issue_id", "github_html_url", "kanban_column") SELECT "id", "repo_id", "title", "description", "status", "priority", "assignee", "created_at", "updated_at", "position", "start_at", "end_at", "group_name", "product_name", "initiative_name", "release_name", "is_deleted", "github_issue_id", "github_html_url", "kanban_column" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_tasks_repo` ON `tasks` (`repo_id`);--> statement-breakpoint
ALTER TABLE `task_events` ADD `object_type` text;--> statement-breakpoint
ALTER TABLE `task_events` ADD `field_name` text;--> statement-breakpoint
ALTER TABLE `task_events` ADD `old_value` text;--> statement-breakpoint
ALTER TABLE `task_events` ADD `new_value` text;