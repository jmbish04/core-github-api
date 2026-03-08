CREATE TABLE IF NOT EXISTS `pr_comments` (
	`id` integer PRIMARY KEY NOT NULL,
	`pr_number` integer NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`type` text NOT NULL,
	`author` text NOT NULL,
	`author_avatar` text,
	`body` text NOT NULL,
	`path` text,
	`line` integer,
	`html_url` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pr_comments_pr_idx` ON `pr_comments` (`repo_owner`,`repo_name`,`pr_number`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pull_requests` (
	`id` integer PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`state` text NOT NULL,
	`author` text NOT NULL,
	`author_avatar` text,
	`html_url` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pull_requests_number_idx` ON `pull_requests` (`repo_owner`,`repo_name`,`number`);