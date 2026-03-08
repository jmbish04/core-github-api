CREATE TABLE `retrofit_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`draft_prompt_id` integer NOT NULL,
	`draft_prompt_version` integer NOT NULL,
	`user_comment` text NOT NULL,
	`ai_updated_language` text,
	`resolved` integer DEFAULT false,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`draft_prompt_id`) REFERENCES `retrofit_prompts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `retrofit_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`thread_id`) REFERENCES `retrofit_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `retrofit_prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`prompt_content` text NOT NULL,
	`previous_prompt_id` integer,
	`message_id` integer,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`thread_id`) REFERENCES `retrofit_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `retrofit_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `retrofit_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`source_repo` text NOT NULL,
	`destination_repo` text,
	`status` text DEFAULT 'drafting' NOT NULL,
	`jules_session_id` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	`updated_at` integer DEFAULT (strftime('%s', 'now'))
);