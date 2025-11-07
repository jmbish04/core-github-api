-- migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  payload_size_bytes INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_request_logs_correlation_id ON request_logs (correlation_id);
