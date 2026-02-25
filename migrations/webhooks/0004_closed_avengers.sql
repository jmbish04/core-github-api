ALTER TABLE `webhook_deliveries` ADD `repo_full_name` text;--> statement-breakpoint
ALTER TABLE `webhook_deliveries` ADD `summary_payload` text;--> statement-breakpoint
CREATE INDEX `repo_full_name_idx` ON `webhook_deliveries` (`repo_full_name`);