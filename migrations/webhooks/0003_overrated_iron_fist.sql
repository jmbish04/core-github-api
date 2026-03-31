CREATE TABLE `agent_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`markdown_content` text NOT NULL,
	`github_path` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
