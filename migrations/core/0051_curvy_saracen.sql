CREATE TABLE `prompt_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`prior_config_prompt` text NOT NULL,
	`new_config_prompt_value` text NOT NULL,
	`removed_language` text,
	`added_language` text,
	`changed_by` text DEFAULT 'ui' NOT NULL
);
