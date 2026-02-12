CREATE TABLE `pricing_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`model_name` text NOT NULL,
	`input_cost_per_m` real NOT NULL,
	`output_cost_per_m` real NOT NULL,
	`input_long_cost_per_m` real,
	`output_long_cost_per_m` real,
	`cache_read_cost_per_m` real,
	`cache_write_cost_per_m` real,
	`metadata` text,
	`source_url` text NOT NULL,
	`scraped_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pricing_provider_idx` ON `pricing_snapshots` (`provider`);--> statement-breakpoint
CREATE INDEX `pricing_model_id_idx` ON `pricing_snapshots` (`model_id`);--> statement-breakpoint
CREATE INDEX `pricing_scraped_at_idx` ON `pricing_snapshots` (`scraped_at`);--> statement-breakpoint
CREATE INDEX `pricing_provider_model_idx` ON `pricing_snapshots` (`provider`,`model_id`);