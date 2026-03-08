CREATE TABLE IF NOT EXISTS `config_audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`changed_by` text DEFAULT 'system',
	`category` text NOT NULL,
	`timestamp` text DEFAULT CURRENT_TIMESTAMP
);
