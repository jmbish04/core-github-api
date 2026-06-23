---
description: Strict governance rules for D1 database instances, Drizzle ORM usage, schema changes, and migration management in the core-github-api project.
---

# D1 & Drizzle ORM Governance Rules

## Table Instance Ownership

Every table in this project belongs to exactly ONE D1 binding. When in doubt, check this table first:

| D1 Binding | Migration Config | Owns |
|-----------|-----------------|------|
| `DB` | `drizzle.config.core.ts` → `migrations/core/` | All application logic tables: `system_logs`, `audit_logs`, `automation_logs`, `repos`, `prs`, `reviews`, `health_*`, `cloudflare_changelog`, `jules_*`, `discord_*`, `agent_*`, `project_*` |
| `DB_WEBHOOKS` | `drizzle.config.webhooks.ts` → `migrations/webhooks/` | Raw GitHub event tables ONLY: `webhook_deliveries`, `pull_request`, `push`, `check_run`, `workflow_run`, `webhook_configs`, `searches`, `repoAnalysis`, `dailyTrends`, `trendingRepos` |

## ORM Client Selection

| Situation | Client to Use | Import |
|-----------|--------------|--------|
| Reading/writing any table on `DB` | `getDb(env.DB)` | `import { getDb } from '@db'` |
| Reading/writing any table on `DB_WEBHOOKS` | `getWebhooksDb(env.DB_WEBHOOKS)` | `import { getWebhooksDb } from '@db'` |
| ❌ FORBIDDEN | `drizzle(env.DB)` or `drizzle(env.DB_WEBHOOKS)` | Never — always pass schema via the getters |

## Pre-Table-Creation Protocol (MANDATORY)

Before creating any new Drizzle table:

1. **Scan existing tables** — run the following and read the relevant schema files:
   ```bash
   grep -r "sqliteTable" src/backend/src/db/schemas/ --include="*.ts" -l
   ```
2. **Evaluate reuse** — can you add a column to an existing table? Is there a table in a different domain that serves this purpose?
3. **Only if no existing table fits** — create a new one
4. **Assign to correct D1 instance** — use the ownership table above to determine which Drizzle config and migration dir to use
5. **Add to the correct barrel** — update the domain's `index.ts` so it is picked up by `schema.ts`

## Schema File Locations

```
src/backend/src/db/
├── schema.ts                     ← master barrel (all domains, used by DB/core)
├── schemas/
│   ├── index.ts                  ← re-exports all domains
│   ├── agents/
│   ├── app/                      ← cloudflare_changelog, etc.
│   ├── discord/
│   ├── github/
│   │   └── webhooks.ts           ← webhook event tables (owned by DB_WEBHOOKS)
│   ├── logs/                     ← system_logs, audit_logs, health_* (owned by DB)
│   ├── ops/
│   ├── webhooks/
│   │   └── automations.ts        ← automation_logs, webhook_configs
│   └── ...
└── index.ts                      ← exports getDb() and getWebhooksDb()
```

## Migration Discipline

- **NEVER** edit files in `migrations/core/` or `migrations/webhooks/` directly
- Generate: `pnpm run db:generate:core` or `pnpm run db:generate:webhooks`
- Apply: `pnpm run migrate:remote:core` or `pnpm run migrate:remote:webhooks`
- Full reset: `pnpm run db:reset` (creates fresh DB instances, archives old migrations)
- Manual repair is ONLY permitted if a migration script fails AND the user explicitly authorizes it

## Fresh Instance Reset Protocol

When you need a clean slate (structural errors, wrong table locations, D1 corruption):

```bash
pnpm run db:reset
# Then, after deploy completes:
pnpm run db:seed:prep   # prepare seed files from pre-delete export
pnpm run db:seed:run    # apply seeds to fresh instances
```

### What `pnpm run db:reset` does:
1. Reads current D1 UUIDs **dynamically from `wrangler.jsonc`** — no hardcoded constants
2. Exports all row data to `scripts/db/data_exports/{timestamp}/` (SQL + JSON) before deletion
3. Deletes old D1 instances via CF REST API
4. Creates new fresh instances with canonical names
5. Updates `wrangler.jsonc` with new UUIDs
6. Archives old migration history to `migrations/_archive/`
7. Chains: `db:generate:all → migrate:remote:all → deploy`

### Seeding After Reset:

**Step 1:** `pnpm run db:seed:prep [-- --export-dir scripts/db/data_exports/TIMESTAMP]`
- Reads the JSON export from the pre-delete backup
- Applies truncation limits (e.g. `system_logs` → last 2000 rows, `webhook_deliveries` → last 500)
- Chunks INSERT statements to stay within D1 limits: 100 bound params/query, 90 KB/statement
- Writes `scripts/db/seeds/{timestamp}/DB.seed.sql` and `DB_WEBHOOKS.seed.sql`

**Step 2:** `pnpm run db:seed:run [-- --seeds-dir scripts/db/seeds/TIMESTAMP]`
- Tries bulk `--file` execution first (fastest)
- Falls back to statement-by-statement with D1 error keyword detection
- Retries on transient overload, aborts on fatal errors (column_notfound, schema mismatch)
- Prints instructive fix guidance for every known D1 error type

### D1 Execution Limits (Hardcoded in scripts as source of truth):
| Limit | Value | Source |
|-------|-------|--------|
| Max bound params per query | 100 | CF hard limit |
| Max SQL statement length | 100 KB (scripts use 90 KB) | CF hard limit |
| Max query duration | 30 seconds | CF hard limit |
| Safe INSERT batch size | 100 rows | CF recommendation |
| Max D1 database size | 10 GB | CF hard limit |

⚠️ **Do NOT put seed files in `migrations/` directories** — wrangler will try to apply them as migrations.

## Health Monitors for D1 Staleness

Three health checks run as part of `POST /api/health/run`:

| Check ID | File | What it detects |
|----------|------|-----------------|
| `webhook_staleness` | `health/checks/webhook-staleness.ts` | `webhook_deliveries` freshness vs latest GitHub API event (fails if >24h lag or empty) |
| `log_staleness` | `health/checks/log-staleness.ts` | `system_logs` freshness (fails if empty or >1 day old) |
| `d1_table_scan` | `health/checks/d1-table-scan.ts` | All tables in both instances — flags empty (0 rows) or stale (>30 days) |

To manually check D1 staleness at any time:
```bash
# Quick row count check
wrangler d1 execute DB --remote --command "SELECT count(*) FROM system_logs;"
wrangler d1 execute DB_WEBHOOKS --remote --command "SELECT count(*) FROM webhook_deliveries;"

# Or trigger the full health suite
curl -X POST https://core-github-api.hacolby.workers.dev/api/health/run | jq '.results[] | select(.name | test("Staleness|Table Scan"))'
```

## Adding a New Table — Checklist

```
[ ] Scanned existing schemas, no suitable table found
[ ] Determined correct D1 instance (DB vs DB_WEBHOOKS)
[ ] Created file in correct schemas/<domain>/ directory
[ ] Exported from schemas/<domain>/index.ts
[ ] Ran pnpm run db:generate:<core|webhooks>
[ ] Reviewed generated migration SQL (do not edit it)
[ ] Ran pnpm run migrate:remote:<core|webhooks>
```
