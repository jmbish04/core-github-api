-- migrations/0001_init.sql

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE,
  prompt TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  search_term TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE repo_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  search_id INTEGER,
  repo_full_name TEXT,
  repo_url TEXT,
  description TEXT,
  relevancy_score REAL,
  analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, repo_full_name)
);
