ALTER TABLE golden_path_config RENAME TO golden_path_config_legacy;

CREATE TABLE golden_path_config_scopes (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  infrastructure TEXT NOT NULL,
  hex_color TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_golden_path_config_scopes_title
  ON golden_path_config_scopes(title);

CREATE TABLE golden_path_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  rule TEXT NOT NULL,
  scope_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scope_id) REFERENCES golden_path_config_scopes(id) ON DELETE CASCADE
);

CREATE TABLE golden_path_config_tag_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  hex_color TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_golden_path_config_tag_definitions_name
  ON golden_path_config_tag_definitions(name);

CREATE TABLE golden_path_config_tag_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  scope_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scope_id) REFERENCES golden_path_config_scopes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES golden_path_config_tag_definitions(id) ON DELETE CASCADE
);

INSERT INTO golden_path_config_scopes (title, description, infrastructure, hex_color)
VALUES
  ('frontend', 'Rules that agents must follow for the frontend on Cloudflare Worker Assets.', 'worker-assets', '#2563eb'),
  ('backend', 'Rules that agents must follow for API and server logic on Cloudflare Workers.', 'workers', '#16a34a'),
  ('ai', 'Rules that coding agents and AI tooling must follow across the platform.', 'coding-agent', '#7c3aed'),
  ('infra', 'Rules for deployment, Wrangler configuration, and platform operations.', 'cloudflare', '#ea580c'),
  ('docs', 'Rules for generated docs, developer guidance, and implementation notes.', 'documentation', '#0891b2');

INSERT INTO golden_path_config_tag_definitions (name, description, is_active, hex_color)
VALUES
  ('cloudflare', 'Cloudflare platform and runtime requirements', 1, '#f97316'),
  ('astro', 'Astro frontend patterns', 1, '#2563eb'),
  ('hono', 'Hono routing and API conventions', 1, '#16a34a'),
  ('drizzle', 'Drizzle ORM and D1 access rules', 1, '#7c3aed'),
  ('agents', 'Coding agent and automation conventions', 1, '#db2777'),
  ('docs', 'Documentation and prompt governance', 1, '#0891b2');

INSERT INTO golden_path_config_tag_mappings (scope_id, tag_id)
SELECT scopes.id, tags.id
FROM golden_path_config_scopes scopes
JOIN golden_path_config_tag_definitions tags
ON (
  (scopes.title = 'frontend' AND tags.name IN ('cloudflare', 'astro')) OR
  (scopes.title = 'backend' AND tags.name IN ('cloudflare', 'hono', 'drizzle')) OR
  (scopes.title = 'ai' AND tags.name IN ('agents', 'cloudflare')) OR
  (scopes.title = 'infra' AND tags.name IN ('cloudflare', 'agents')) OR
  (scopes.title = 'docs' AND tags.name IN ('docs', 'agents'))
);

INSERT INTO golden_path_config (title, description, rule, scope_id)
SELECT
  CASE scopes.title
    WHEN 'frontend' THEN 'Frontend Standard'
    WHEN 'backend' THEN 'Backend Standard'
    WHEN 'ai' THEN 'AI Standard'
    WHEN 'infra' THEN 'Infrastructure Standard'
    WHEN 'docs' THEN 'Documentation Standard'
  END || ' #' || (ROW_NUMBER() OVER (PARTITION BY scopes.title ORDER BY json_each.key) + 1),
  'Migrated from the legacy golden path configuration.',
  json_each.value,
  scopes.id
FROM golden_path_config_legacy legacy
JOIN golden_path_config_scopes scopes
JOIN json_each(
  CASE scopes.title
    WHEN 'frontend' THEN legacy.frontend
    WHEN 'backend' THEN legacy.backend
    WHEN 'ai' THEN legacy.ai
    WHEN 'infra' THEN legacy.infra
    WHEN 'docs' THEN legacy.docs
  END
) AS json_each
WHERE TRIM(COALESCE(json_each.value, '')) <> '';

DROP TABLE golden_path_config_legacy;
