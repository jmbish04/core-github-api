CREATE TABLE `docs_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`icon_name` text DEFAULT 'Sparkles' NOT NULL,
	`icon_bg` text DEFAULT 'bg-indigo-500/10 border border-indigo-500/20' NOT NULL,
	`icon_color` text DEFAULT 'text-indigo-400' NOT NULL,
	`workshop_url` text,
	`docs_slug` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `workshop_ux_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`repo_owner` text NOT NULL,
	`repo_name` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`phase` text DEFAULT 'idle' NOT NULL,
	`original_prompt` text NOT NULL,
	`enhanced_prompt` text,
	`design_md` text,
	`stitch_project_id` text,
	`enhance_jules_session_id` text,
	`design_jules_session_id` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `workshop_ux_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`page_name` text NOT NULL,
	`page_title` text NOT NULL,
	`page_prompt` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`review_iterations` integer DEFAULT 0 NOT NULL,
	`review_score` integer,
	`stitch_screen_id` text,
	`stitch_html` text,
	`stitch_screenshot_url` text,
	`github_html_path` text,
	`github_screenshot_path` text,
	`github_commit_sha` text,
	`jules_session_id` text,
	`jules_pr_url` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
