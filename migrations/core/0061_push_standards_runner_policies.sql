CREATE TABLE IF NOT EXISTS automation_runner_policies (
  id text PRIMARY KEY NOT NULL,
  title text NOT NULL,
  description text,
  automation_key text NOT NULL,
  trigger_event text NOT NULL,
  runner_kind text NOT NULL,
  target_ref text,
  repo_owner text,
  repo_name text,
  branch_pattern text,
  infrastructure text,
  priority integer NOT NULL DEFAULT 100,
  is_active integer NOT NULL DEFAULT 1,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_automation_runner_policies_automation
  ON automation_runner_policies(automation_key);

CREATE INDEX IF NOT EXISTS idx_automation_runner_policies_active
  ON automation_runner_policies(is_active);

CREATE INDEX IF NOT EXISTS idx_automation_runner_policies_event
  ON automation_runner_policies(trigger_event);
