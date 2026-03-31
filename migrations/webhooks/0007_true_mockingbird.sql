CREATE TABLE `plan_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`planning_request_id` text NOT NULL,
	`prompt` text NOT NULL,
	`response` text NOT NULL,
	FOREIGN KEY (`planning_request_id`) REFERENCES `planning_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `planning_requests_upscaling` (
	`id` text PRIMARY KEY NOT NULL,
	`planning_request_id` text NOT NULL,
	`task` text NOT NULL,
	`details` text NOT NULL,
	FOREIGN KEY (`planning_request_id`) REFERENCES `planning_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pr_review_checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`planning_request_id` text NOT NULL,
	`pr_url` text NOT NULL,
	`item` text NOT NULL,
	`status` text NOT NULL,
	`iteration` integer NOT NULL,
	FOREIGN KEY (`planning_request_id`) REFERENCES `planning_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_planning_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`github_repo_owner` text,
	`github_repo_name` text,
	`original_prompt` text NOT NULL,
	`upscaled_prompt` text
);
--> statement-breakpoint
INSERT INTO `__new_planning_requests`("id", "timestamp", "github_repo_owner", "github_repo_name", "original_prompt", "upscaled_prompt") SELECT "id", "timestamp", "github_repo_owner", "github_repo_name", "original_prompt", "upscaled_prompt" FROM `planning_requests`;--> statement-breakpoint
DROP TABLE `planning_requests`;--> statement-breakpoint
ALTER TABLE `__new_planning_requests` RENAME TO `planning_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;