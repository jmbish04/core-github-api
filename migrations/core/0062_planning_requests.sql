CREATE TABLE IF NOT EXISTS planning_requests (
  id text PRIMARY KEY NOT NULL,
  title text,
  project_id text,
  project_name text,
  workstream text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  prompt text NOT NULL,
  source_context_json text,
  github_repo text,
  base_branch text DEFAULT 'main',
  stitch_project_id text,
  stitch_screen_ids_json text,
  requires_plan_approval integer NOT NULL DEFAULT 1,
  auto_orchestrate integer NOT NULL DEFAULT 1,
  auto_implement integer NOT NULL DEFAULT 0,
  jules_session_id text,
  workflow_instance_id text,
  latest_plan_artifact_id text,
  r2_plan_key text,
  vectorize_index_id text,
  created_by text,
  approved_by text,
  approved_at text,
  completed_at text,
  error_message text,
  metadata_json text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT planning_requests_workstream_check
    CHECK (workstream in ('api_request', 'project_planning', 'integration_stitch', 'stitch_implementation')),
  CONSTRAINT planning_requests_status_check
    CHECK (status in ('queued', 'running', 'awaiting_stitch_approval', 'awaiting_plan_approval', 'approved', 'revising', 'orchestrating', 'implementing', 'completed', 'rejected', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS planning_requests_workstream_idx
  ON planning_requests(workstream);

CREATE INDEX IF NOT EXISTS planning_requests_status_idx
  ON planning_requests(status);

CREATE INDEX IF NOT EXISTS planning_requests_project_idx
  ON planning_requests(project_id);

CREATE INDEX IF NOT EXISTS planning_requests_session_idx
  ON planning_requests(jules_session_id);

CREATE INDEX IF NOT EXISTS planning_requests_workflow_idx
  ON planning_requests(workflow_instance_id);

CREATE TABLE IF NOT EXISTS planning_request_events (
  id text PRIMARY KEY NOT NULL,
  request_id text NOT NULL,
  source text NOT NULL,
  event_type text NOT NULL,
  title text,
  message text,
  payload_json text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS planning_request_events_request_idx
  ON planning_request_events(request_id);

CREATE INDEX IF NOT EXISTS planning_request_events_source_idx
  ON planning_request_events(source);

CREATE INDEX IF NOT EXISTS planning_request_events_type_idx
  ON planning_request_events(event_type);

CREATE INDEX IF NOT EXISTS planning_request_events_created_idx
  ON planning_request_events(created_at);

CREATE TABLE IF NOT EXISTS planning_request_artifacts (
  id text PRIMARY KEY NOT NULL,
  request_id text NOT NULL,
  artifact_kind text NOT NULL,
  storage_driver text NOT NULL,
  storage_key text,
  mime_type text,
  content_text text,
  metadata_json text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS planning_request_artifacts_request_idx
  ON planning_request_artifacts(request_id);

CREATE INDEX IF NOT EXISTS planning_request_artifacts_kind_idx
  ON planning_request_artifacts(artifact_kind);

CREATE INDEX IF NOT EXISTS planning_request_artifacts_driver_idx
  ON planning_request_artifacts(storage_driver);

CREATE INDEX IF NOT EXISTS planning_request_artifacts_created_idx
  ON planning_request_artifacts(created_at);

ALTER TABLE jules_sessions ADD COLUMN planning_request_id text;
ALTER TABLE jules_sessions ADD COLUMN session_role text;

CREATE INDEX IF NOT EXISTS jules_sessions_planning_request_idx
  ON jules_sessions(planning_request_id);

ALTER TABLE jules_webhook_events ADD COLUMN planning_request_id text;
ALTER TABLE jules_webhook_events ADD COLUMN session_role text;

CREATE INDEX IF NOT EXISTS jules_webhook_events_planning_request_idx
  ON jules_webhook_events(planning_request_id);
