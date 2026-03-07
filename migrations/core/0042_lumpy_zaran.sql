PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_daily_research_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`prompt` text NOT NULL,
	`status` text NOT NULL,
	`judge_notes` text,
	`findings` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_daily_research_docs`("id", "date", "prompt", "status", "judge_notes", "findings", "created_at") SELECT "id", "date", "prompt", "status", "judge_notes", "findings", "created_at" FROM `daily_research_docs`;--> statement-breakpoint
DROP TABLE `daily_research_docs`;--> statement-breakpoint
ALTER TABLE `__new_daily_research_docs` RENAME TO `daily_research_docs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;