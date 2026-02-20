CREATE TABLE `project_favorites` (
	`user_id` text NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `repo_owner`, `repo_name`)
);
--> statement-breakpoint
CREATE INDEX `idx_project_favorites_user` ON `project_favorites` (`user_id`);--> statement-breakpoint
CREATE TABLE `project_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`parent_id` text,
	`item_type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`assignee` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	`metadata_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "project_plans_item_type_check" CHECK("project_plans"."item_type" in ('epic', 'story', 'task')),
	CONSTRAINT "project_plans_status_check" CHECK("project_plans"."status" in ('todo', 'in_progress', 'blocked', 'done')),
	CONSTRAINT "project_plans_priority_check" CHECK("project_plans"."priority" in ('low', 'medium', 'high', 'critical'))
);
--> statement-breakpoint
CREATE INDEX `idx_project_plans_project` ON `project_plans` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_plans_parent` ON `project_plans` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_project_plans_type_status` ON `project_plans` (`item_type`,`status`);