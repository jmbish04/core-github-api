PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__new_tasks` (
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
	CONSTRAINT "status_check" CHECK("__new_tasks"."status" IN ('backlog','todo','in-progress','review','done')),
	CONSTRAINT "kanban_check" CHECK("__new_tasks"."kanban_column" IN ('backlog','planned','in_progress','done')),
	CONSTRAINT "priority_check" CHECK("__new_tasks"."priority" IN ('low','medium','high','critical'))
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "repo_id", "title", "description", "status", "priority", "assignee", "created_at", "updated_at", "position", "start_at", "end_at", "group_name", "product_name", "initiative_name", "release_name", "is_deleted", "github_issue_id", "github_html_url", "kanban_column") SELECT "id", "repo_id", "title", "description", "status", "priority", "assignee", "created_at", "updated_at", "position", "start_at", "end_at", "group_name", "product_name", "initiative_name", "release_name", "is_deleted", "github_issue_id", "github_html_url", "kanban_column" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_tasks_repo` ON `tasks` (`repo_id`);