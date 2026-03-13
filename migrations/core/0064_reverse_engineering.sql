CREATE TABLE IF NOT EXISTS reverse_eng_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  github_owner TEXT NOT NULL,
  github_repo TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  frontend_url TEXT,
  resolved_preview_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT,
  detected_stack_json TEXT,
  preview_resolution_json TEXT,
  frontend_auth_json TEXT,
  requested_auth_json TEXT,
  screenshot_urls_json TEXT,
  prd_markdown TEXT,
  epics_json TEXT,
  user_journeys_json TEXT,
  repo_research_json TEXT,
  jules_research_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  CONSTRAINT reverse_eng_snapshots_status_check CHECK (status in ('pending', 'running', 'awaiting_auth', 'complete', 'failed'))
);

CREATE INDEX IF NOT EXISTS reverse_eng_snapshots_project_idx ON reverse_eng_snapshots(project_id);
CREATE INDEX IF NOT EXISTS reverse_eng_snapshots_repo_idx ON reverse_eng_snapshots(github_owner, github_repo);
CREATE INDEX IF NOT EXISTS reverse_eng_snapshots_status_idx ON reverse_eng_snapshots(status);

CREATE TABLE IF NOT EXISTS reverse_eng_ux (
  id TEXT PRIMARY KEY NOT NULL,
  snapshot_id TEXT NOT NULL REFERENCES reverse_eng_snapshots(id) ON DELETE CASCADE,
  overall_description TEXT,
  page_analyses_json TEXT,
  screenshot_gallery_json TEXT,
  page_user_journeys_json TEXT,
  vision_analysis_json TEXT,
  code_analysis_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS reverse_eng_ux_snapshot_idx ON reverse_eng_ux(snapshot_id);

CREATE TABLE IF NOT EXISTS reverse_eng_backend (
  id TEXT PRIMARY KEY NOT NULL,
  snapshot_id TEXT NOT NULL REFERENCES reverse_eng_snapshots(id) ON DELETE CASCADE,
  architecture_markdown TEXT,
  endpoint_inventory_json TEXT,
  data_model_json TEXT,
  integrations_json TEXT,
  auth_model_json TEXT,
  deployment_model_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS reverse_eng_backend_snapshot_idx ON reverse_eng_backend(snapshot_id);

CREATE TABLE IF NOT EXISTS reverse_eng_events (
  id TEXT PRIMARY KEY NOT NULL,
  snapshot_id TEXT NOT NULL REFERENCES reverse_eng_snapshots(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT,
  message TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS reverse_eng_events_snapshot_idx ON reverse_eng_events(snapshot_id);
CREATE INDEX IF NOT EXISTS reverse_eng_events_event_idx ON reverse_eng_events(event_type);
