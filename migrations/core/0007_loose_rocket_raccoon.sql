CREATE TABLE `chat_room_subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`subscribed_at` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chat_room_subscribers_room` ON `chat_room_subscribers` (`room_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_room_subscribers_agent` ON `chat_room_subscribers` (`agent_name`);--> statement-breakpoint
CREATE INDEX `idx_chat_room_subscribers_unique` ON `chat_room_subscribers` (`room_id`,`agent_name`);--> statement-breakpoint
CREATE TABLE `guardrail_evaluations` (
	`request_id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`status` text NOT NULL,
	`score` integer NOT NULL,
	`issues_json` text,
	`evaluated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_guardrail_evals_status` ON `guardrail_evaluations` (`status`);--> statement-breakpoint
CREATE INDEX `idx_guardrail_evals_agent` ON `guardrail_evaluations` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_guardrail_evals_time` ON `guardrail_evaluations` (`evaluated_at`);--> statement-breakpoint
CREATE TABLE `guardrail_rule_cache` (
	`rule_key` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`content` text NOT NULL,
	`cached_at` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_guardrail_rule_cache_agent` ON `guardrail_rule_cache` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_guardrail_rule_cache_time` ON `guardrail_rule_cache` (`cached_at`);