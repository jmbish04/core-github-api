CREATE TABLE IF NOT EXISTS `starred_repos` (
	`user_id` text NOT NULL,
	`repo_id` text NOT NULL,
	`starred_at` text DEFAULT CURRENT_TIMESTAMP,
	`sync_batch_id` text,
	PRIMARY KEY(`user_id`, `repo_id`),
	FOREIGN KEY (`repo_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_starred_repos_user` ON `starred_repos` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_starred_repos_repo` ON `starred_repos` (`repo_id`);