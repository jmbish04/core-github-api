CREATE TABLE `chat_room_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text,
	`user_name` text,
	`message_type` text NOT NULL,
	`content` text,
	`metadata_json` text,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chat_room_logs_room` ON `chat_room_logs` (`room_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_room_logs_timestamp` ON `chat_room_logs` (`timestamp`);--> statement-breakpoint
CREATE TABLE `plan_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`jules_session_id` text,
	`repo_owner` text,
	`repo_name` text,
	`revision_number` integer DEFAULT 1 NOT NULL,
	`is_final` integer DEFAULT false,
	`human_feedback` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plan_revisions_plan` ON `plan_revisions` (`plan_id`);--> statement-breakpoint
CREATE INDEX `idx_plan_revisions_session` ON `plan_revisions` (`jules_session_id`);--> statement-breakpoint
CREATE TABLE `phases` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`plan_revision_id` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo',
	`start_date` integer,
	`end_date` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_revision_id`) REFERENCES `plan_revisions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_phases_repo` ON `phases` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_phases_revision` ON `phases` (`plan_revision_id`);--> statement-breakpoint
CREATE TABLE `sprints` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_id` text NOT NULL,
	`plan_revision_id` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo',
	`start_date` integer,
	`end_date` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_revision_id`) REFERENCES `plan_revisions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_sprints_repo` ON `sprints` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_sprints_revision` ON `sprints` (`plan_revision_id`);--> statement-breakpoint
CREATE TABLE `epic_epics_map` (
	`parent_epic_id` text NOT NULL,
	`child_epic_id` text NOT NULL,
	PRIMARY KEY(`parent_epic_id`, `child_epic_id`),
	FOREIGN KEY (`parent_epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_epic_epics_parent` ON `epic_epics_map` (`parent_epic_id`);--> statement-breakpoint
CREATE INDEX `idx_epic_epics_child` ON `epic_epics_map` (`child_epic_id`);--> statement-breakpoint
CREATE TABLE `epic_stories_map` (
	`epic_id` text NOT NULL,
	`story_id` text NOT NULL,
	PRIMARY KEY(`epic_id`, `story_id`),
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_epic_stories_epic` ON `epic_stories_map` (`epic_id`);--> statement-breakpoint
CREATE INDEX `idx_epic_stories_story` ON `epic_stories_map` (`story_id`);--> statement-breakpoint
CREATE TABLE `epic_tasks_map` (
	`epic_id` text NOT NULL,
	`task_id` text NOT NULL,
	PRIMARY KEY(`epic_id`, `task_id`),
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_epic_tasks_epic` ON `epic_tasks_map` (`epic_id`);--> statement-breakpoint
CREATE INDEX `idx_epic_tasks_task` ON `epic_tasks_map` (`task_id`);--> statement-breakpoint
CREATE TABLE `phase_epics_map` (
	`phase_id` text NOT NULL,
	`epic_id` text NOT NULL,
	PRIMARY KEY(`phase_id`, `epic_id`),
	FOREIGN KEY (`phase_id`) REFERENCES `phases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_phase_epics_phase` ON `phase_epics_map` (`phase_id`);--> statement-breakpoint
CREATE INDEX `idx_phase_epics_epic` ON `phase_epics_map` (`epic_id`);--> statement-breakpoint
CREATE TABLE `phase_sprints_map` (
	`phase_id` text NOT NULL,
	`sprint_id` text NOT NULL,
	PRIMARY KEY(`phase_id`, `sprint_id`),
	FOREIGN KEY (`phase_id`) REFERENCES `phases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_phase_sprints_phase` ON `phase_sprints_map` (`phase_id`);--> statement-breakpoint
CREATE INDEX `idx_phase_sprints_sprint` ON `phase_sprints_map` (`sprint_id`);--> statement-breakpoint
CREATE TABLE `sprint_epics_map` (
	`sprint_id` text NOT NULL,
	`epic_id` text NOT NULL,
	PRIMARY KEY(`sprint_id`, `epic_id`),
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sprint_epics_sprint` ON `sprint_epics_map` (`sprint_id`);--> statement-breakpoint
CREATE INDEX `idx_sprint_epics_epic` ON `sprint_epics_map` (`epic_id`);--> statement-breakpoint
CREATE TABLE `story_stories_map` (
	`parent_story_id` text NOT NULL,
	`child_story_id` text NOT NULL,
	PRIMARY KEY(`parent_story_id`, `child_story_id`),
	FOREIGN KEY (`parent_story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_story_stories_parent` ON `story_stories_map` (`parent_story_id`);--> statement-breakpoint
CREATE INDEX `idx_story_stories_child` ON `story_stories_map` (`child_story_id`);--> statement-breakpoint
CREATE TABLE `story_tasks_map` (
	`story_id` text NOT NULL,
	`task_id` text NOT NULL,
	PRIMARY KEY(`story_id`, `task_id`),
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_story_tasks_story` ON `story_tasks_map` (`story_id`);--> statement-breakpoint
CREATE INDEX `idx_story_tasks_task` ON `story_tasks_map` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_tasks_map` (
	`parent_task_id` text NOT NULL,
	`child_task_id` text NOT NULL,
	PRIMARY KEY(`parent_task_id`, `child_task_id`),
	FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_task_tasks_parent` ON `task_tasks_map` (`parent_task_id`);--> statement-breakpoint
CREATE INDEX `idx_task_tasks_child` ON `task_tasks_map` (`child_task_id`);--> statement-breakpoint
DROP TABLE `planning_room_logs`;--> statement-breakpoint
ALTER TABLE `stories` ADD `plan_revision_id` text REFERENCES plan_revisions(id);--> statement-breakpoint
CREATE INDEX `idx_stories_revision` ON `stories` (`plan_revision_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `plan_revision_id` text REFERENCES plan_revisions(id);--> statement-breakpoint
CREATE INDEX `idx_tasks_revision` ON `tasks` (`plan_revision_id`);