-- ALTER TABLE `research_candidates` ADD `source_id` text NOT NULL;--> statement-breakpoint
ALTER TABLE `research_projects` ADD `global_deduplication` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `research_projects` ADD `discord_selected_channels` text;