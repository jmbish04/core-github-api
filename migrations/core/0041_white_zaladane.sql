PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__new_tag_application_mapping` (
	`app_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`app_id`, `tag_id`),
	FOREIGN KEY (`app_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tag_application_mapping`("app_id", "tag_id", "created_at") SELECT "app_id", "tag_id", "created_at" FROM `tag_application_mapping`;--> statement-breakpoint
DROP TABLE `tag_application_mapping`;--> statement-breakpoint
ALTER TABLE `__new_tag_application_mapping` RENAME TO `tag_application_mapping`;--> statement-breakpoint
PRAGMA foreign_keys=ON;