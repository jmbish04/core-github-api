CREATE TABLE IF NOT EXISTS test_defs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  severity TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  error_map TEXT, -- JSON string of { code: { meaning, fix } }
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS test_results (
  id TEXT PRIMARY KEY,
  session_uuid TEXT NOT NULL,
  test_fk TEXT NOT NULL REFERENCES test_defs(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('pass','fail')),
  error_code TEXT,
  raw TEXT, -- JSON
  ai_human_readable_error_description TEXT,
  ai_prompt_to_fix_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_results_session ON test_results(session_uuid);
CREATE INDEX IF NOT EXISTS idx_results_testfk ON test_results(test_fk);
CREATE INDEX IF NOT EXISTS idx_results_finished ON test_results(finished_at);
