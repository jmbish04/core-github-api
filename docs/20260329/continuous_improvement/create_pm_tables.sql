-- ============================================================
-- create_pm_tables.sql
-- Creates pm_projects, pm_epics, pm_stories, pm_tasks tables
-- Generated: 2026-03-31
-- Safe to re-run (CREATE TABLE IF NOT EXISTS)
-- ============================================================

CREATE TABLE IF NOT EXISTS `pm_projects` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `status` text DEFAULT 'todo',
  `created_at` integer,
  `updated_at` integer
);

CREATE TABLE IF NOT EXISTS `pm_epics` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text REFERENCES `pm_projects`(`id`) ON DELETE CASCADE,
  `title` text NOT NULL,
  `description` text,
  `status` text DEFAULT 'todo',
  `priority` text DEFAULT 'medium',
  `created_at` integer,
  `updated_at` integer
);

CREATE TABLE IF NOT EXISTS `pm_stories` (
  `id` text PRIMARY KEY NOT NULL,
  `epic_id` text REFERENCES `pm_epics`(`id`) ON DELETE CASCADE,
  `title` text NOT NULL,
  `description` text,
  `status` text DEFAULT 'todo',
  `priority` text DEFAULT 'medium',
  `created_at` integer,
  `updated_at` integer
);

CREATE TABLE IF NOT EXISTS `pm_tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `story_id` text REFERENCES `pm_stories`(`id`) ON DELETE CASCADE,
  `title` text NOT NULL,
  `description` text,
  `status` text DEFAULT 'todo',
  `priority` text DEFAULT 'medium',
  `order` integer DEFAULT 0,
  `created_at` integer,
  `updated_at` integer
);
