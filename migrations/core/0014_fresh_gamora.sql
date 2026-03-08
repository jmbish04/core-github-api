CREATE TABLE IF NOT EXISTS `health_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`details` text,
	`duration_ms` integer DEFAULT 0,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`run_id`) REFERENCES `health_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `health_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`trigger` text DEFAULT 'manual',
	`duration_ms` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`metadata` text
);
