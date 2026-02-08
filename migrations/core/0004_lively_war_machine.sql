PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_repo_stats` (
	`repo_id` text PRIMARY KEY NOT NULL,
	`health_score` integer,
	`open_issues_count` integer,
	`prs_merged_this_week` integer,
	`last_updated` text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "health_score_check" CHECK("__new_repo_stats"."health_score" BETWEEN 0 AND 100)
);
--> statement-breakpoint
INSERT INTO `__new_repo_stats`("repo_id", "health_score", "open_issues_count", "prs_merged_this_week", "last_updated") SELECT "repo_id", "health_score", "open_issues_count", "prs_merged_this_week", "last_updated" FROM `repo_stats`;--> statement-breakpoint
DROP TABLE `repo_stats`;--> statement-breakpoint
ALTER TABLE `__new_repo_stats` RENAME TO `repo_stats`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
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
	CONSTRAINT "status_check" CHECK("__new_tasks"."status" IN ('backlog','todo','in-progress','review','done')),
	CONSTRAINT "priority_check" CHECK("__new_tasks"."priority" IN ('low','medium','high','critical'))
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "repo_id", "title", "description", "status", "priority", "assignee", "created_at", "updated_at", "position") SELECT "id", "repo_id", "title", "description", "status", "priority", "assignee", "created_at", "updated_at", "position" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
CREATE INDEX `idx_tasks_repo` ON `tasks` (`repo_id`);