CREATE TABLE `cloudflare_docs_interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`source` text NOT NULL,
	`github_url` text,
	`user_prompt` text NOT NULL,
	`mcp_query` text,
	`mcp_response` text,
	`response_sent` text NOT NULL,
	`follow_up_prompts` text,
	`provider` text,
	`model_used` text,
	`error` text,
	`created_at` text NOT NULL
);
