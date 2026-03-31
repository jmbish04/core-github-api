CREATE TABLE `epics` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo',
	`priority` text DEFAULT 'medium',
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_epics_repo` ON `epics` (`repo_id`);--> statement-breakpoint
CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo',
	`priority` text DEFAULT 'medium',
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_stories_repo` ON `stories` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_stories_parent` ON `stories` (`parent_id`);--> statement-breakpoint
DROP TABLE `project_phases`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
DROP TABLE `project_plans`;--> statement-breakpoint
DROP TABLE `pm_epics`;--> statement-breakpoint
DROP TABLE `pm_projects`;--> statement-breakpoint
DROP TABLE `pm_stories`;--> statement-breakpoint
DROP TABLE `pm_tasks`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reverse_eng_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`github_owner` text NOT NULL,
	`github_repo` text NOT NULL,
	`repo_url` text NOT NULL,
	`branch` text DEFAULT 'main' NOT NULL,
	`frontend_url` text,
	`resolved_preview_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`title` text,
	`detected_stack_json` text,
	`preview_resolution_json` text,
	`frontend_auth_json` text,
	`requested_auth_json` text,
	`screenshot_urls_json` text,
	`prd_markdown` text,
	`epics_json` text,
	`user_journeys_json` text,
	`repo_research_json` text,
	`jules_research_json` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "reverse_eng_snapshots_status_check" CHECK("__new_reverse_eng_snapshots"."status" in ('pending', 'running', 'awaiting_auth', 'complete', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_reverse_eng_snapshots`("id", "project_id", "github_owner", "github_repo", "repo_url", "branch", "frontend_url", "resolved_preview_url", "status", "title", "detected_stack_json", "preview_resolution_json", "frontend_auth_json", "requested_auth_json", "screenshot_urls_json", "prd_markdown", "epics_json", "user_journeys_json", "repo_research_json", "jules_research_json", "error_message", "created_at", "updated_at", "completed_at") SELECT "id", "project_id", "github_owner", "github_repo", "repo_url", "branch", "frontend_url", "resolved_preview_url", "status", "title", "detected_stack_json", "preview_resolution_json", "frontend_auth_json", "requested_auth_json", "screenshot_urls_json", "prd_markdown", "epics_json", "user_journeys_json", "repo_research_json", "jules_research_json", "error_message", "created_at", "updated_at", "completed_at" FROM `reverse_eng_snapshots`;--> statement-breakpoint
DROP TABLE `reverse_eng_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_reverse_eng_snapshots` RENAME TO `reverse_eng_snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `reverse_eng_snapshots_project_idx` ON `reverse_eng_snapshots` (`project_id`);--> statement-breakpoint
CREATE INDEX `reverse_eng_snapshots_repo_idx` ON `reverse_eng_snapshots` (`github_owner`,`github_repo`);--> statement-breakpoint
CREATE INDEX `reverse_eng_snapshots_status_idx` ON `reverse_eng_snapshots` (`status`);--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'backlog' NOT NULL,
	`priority` text DEFAULT 'low' NOT NULL,
	`assignee` text,
	`position` integer DEFAULT 0,
	`kanban_column` text DEFAULT 'backlog' NOT NULL,
	`github_issue_id` integer,
	`github_html_url` text,
	`is_deleted` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "status_check" CHECK("__new_tasks"."status" IN ('todo','in_progress','done','backlog','cancelled')),
	CONSTRAINT "kanban_check" CHECK("__new_tasks"."kanban_column" IN ('backlog','todo','in_progress','in_review','done')),
	CONSTRAINT "priority_check" CHECK("__new_tasks"."priority" IN ('low','medium','high','critical','urgent'))
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "repo_id", "parent_id", "title", "description", "status", "priority", "assignee", "position", "kanban_column", "github_issue_id", "github_html_url", "is_deleted", "created_at", "updated_at") SELECT "id", "repo_id", "parent_id", "title", "description", "status", "priority", "assignee", "position", "kanban_column", "github_issue_id", "github_html_url", "is_deleted", "created_at", "updated_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
CREATE INDEX `idx_tasks_repo` ON `tasks` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_parent` ON `tasks` (`parent_id`);--> statement-breakpoint
CREATE TABLE `__new_task_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`content` text NOT NULL,
	`author` text NOT NULL,
	`github_comment_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_task_comments`("id", "task_id", "content", "author", "github_comment_id", "created_at", "updated_at") SELECT "id", "task_id", "content", "author", "github_comment_id", "created_at", "updated_at" FROM `task_comments`;--> statement-breakpoint
DROP TABLE `task_comments`;--> statement-breakpoint
ALTER TABLE `__new_task_comments` RENAME TO `task_comments`;--> statement-breakpoint
CREATE INDEX `idx_comments_task` ON `task_comments` (`task_id`);