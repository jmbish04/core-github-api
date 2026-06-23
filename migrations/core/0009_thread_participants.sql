-- Phase 5: thread_participants schema for unified chat persistence
-- Tracks which agents (and users) participate in a given thread

-- CREATE TABLE IF NOT EXISTS `thread_participants` (
-- 	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
-- 	`thread_id` integer NOT NULL REFERENCES `threads`(`id`) ON DELETE CASCADE,
-- 	`agent_name` text NOT NULL,
-- 	`role` text DEFAULT 'participant' NOT NULL,
-- 	`joined_at` integer NOT NULL,
-- 	`left_at` integer
-- );

-- CREATE INDEX IF NOT EXISTS `tp_thread_id_idx` ON `thread_participants` (`thread_id`);
-- CREATE UNIQUE INDEX IF NOT EXISTS `tp_thread_agent_idx` ON `thread_participants` (`thread_id`, `agent_name`);
