PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__new_workshop_project_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`project_name` text NOT NULL,
	`generated_date` text NOT NULL,
	`total_phases` integer NOT NULL,
	`phases` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `workshop_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_workshop_project_tasks`("id", "project_id", "project_name", "generated_date", "total_phases", "phases", "created_at", "updated_at") SELECT "id", "project_id", "project_name", "generated_date", "total_phases", "phases", "created_at", "updated_at" FROM `workshop_project_tasks`;--> statement-breakpoint
DROP TABLE `workshop_project_tasks`;--> statement-breakpoint
ALTER TABLE `__new_workshop_project_tasks` RENAME TO `workshop_project_tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;