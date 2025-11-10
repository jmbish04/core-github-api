-- migrations/0002_gh_management_config.sql
-- Table for tracking GitHub management operations (retrofit workflows, etc.)

CREATE TABLE IF NOT EXISTS gh_management_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  repo_name TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  status_details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gh_management_config_timestamp ON gh_management_config (timestamp);
CREATE INDEX IF NOT EXISTS idx_gh_management_config_repo_name ON gh_management_config (repo_name);
CREATE INDEX IF NOT EXISTS idx_gh_management_config_action ON gh_management_config (action);
CREATE INDEX IF NOT EXISTS idx_gh_management_config_status ON gh_management_config (status);
