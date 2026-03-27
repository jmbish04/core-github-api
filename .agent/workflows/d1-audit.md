---
description: Workflow for auditing D1 database architecture — verifying table ownership, ORM correctness, staleness, and applying the reset+seed process when needed.
---

# D1 Architecture Audit Workflow

Run this workflow anytime you are:
- Adding new tables or schemas
- Seeing empty tables or silent data loss
- Suspecting a table is on the wrong D1 instance
- About to reset D1 instances with `pnpm run db:reset`
- Checking if D1 instances are OK or stale

---

## Phase 1 — Map Current State

1. **List all schema files**:
   ```bash
   find src/backend/src/db/schemas -name "*.ts" | sort
   ```

2. **Check drizzle.config.webhooks.ts** — verify it ONLY contains:
   - `schemas/github/webhooks.ts`
   - `schemas/webhooks/automations.ts`
   - Nothing from `schemas/logs/`, `schemas/app/`, etc.

3. **Check drizzle.config.core.ts** — verify it points to `schema.core.ts`

4. **Verify ORM client usage**:
   ```bash
   grep -rn "drizzle(env\|drizzle(this.env\|drizzle(c.env" src/backend/src/ --include="*.ts"
   ```
   Any hit here is a bug — should use `getDb()` or `getWebhooksDb()` instead.

5. **Verify correct binding per client**:
   ```bash
   grep -rn "getWebhooksDb" src/backend/src/ --include="*.ts"
   ```
   For each hit: confirm the table being queried is actually owned by DB_WEBHOOKS.

---

## Phase 2 — Check Live D1 Content (Manual Audit)

Run these to see which tables exist and have data in each instance:

```bash
# Core DB — row counts (spot check key tables)
wrangler d1 execute DB --remote --command "SELECT 'system_logs' as tbl, count(*) as rows FROM system_logs UNION ALL SELECT 'automation_logs', count(*) FROM automation_logs UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs;"

# Core DB — latest system log (staleness check)
wrangler d1 execute DB --remote --command "SELECT level, message, datetime(timestamp, 'unixepoch') as ts FROM system_logs ORDER BY timestamp DESC LIMIT 3;"

# Webhooks DB — delivery count + freshness
wrangler d1 execute DB_WEBHOOKS --remote --command "SELECT count(*) as deliveries, max(created_at) as latest FROM webhook_deliveries;"
```

### Automated Staleness Checks (Health Suite)

The health suite includes 3 D1-specific monitors. Run them anytime:

```bash
curl -s -X POST https://core-github-api.hacolby.workers.dev/api/health/run | \
  python3 -c "import sys, json; [print(r['name'], r['status'], '|', r['message']) for r in json.load(sys.stdin).get('results', []) if r['name'] in ['Webhook Staleness','Log Staleness','D1 Table Scan']]"
```

| Check ID | Fails When |
|----------|-----------|
| `webhook_staleness` | `webhook_deliveries` is empty OR >24h lag behind GitHub events OR >30 days since last delivery |
| `log_staleness` | `system_logs` is empty OR latest entry >1 day old |
| `d1_table_scan` | Any table has 0 rows (unexpectedly empty) OR last row >30 days old |

---

## Phase 3 — Diagnose Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Table exists in wrong instance | drizzle.config.*.ts has wrong schema file | Move schema to correct config, run `db:reset` |
| Table missing entirely | Migration never ran or ran against wrong DB | Run `db:generate:*` then `migrate:remote:*` |
| `count(*)` always 0 on reads | Raw `drizzle()` used without schema | Switch to `getDb()` or `getWebhooksDb()` |
| Logs never appear in `system_logs` | `logger.ts` used raw `drizzle()` | Fix to use `getDb(env.DB)` |
| `automation_logs` empty | `BaseAutomation` wrote to DB_WEBHOOKS | Fix to use `getDb(env.DB)` |
| `webhook_deliveries` empty after long use | Webhook delivery route not writing to DB_WEBHOOKS | Trace the GitHub webhook handler through `getWebhooksDb()` |
| Health check fires `d1_table_scan failure` | Fresh instance after reset, expected to be empty | Seeds have not been applied yet — run `db:seed:prep` + `db:seed:run` |

---

## Phase 4 — Full Reset (when needed)

Use when tables are on the wrong instance or you need a clean slate:

```bash
pnpm run db:reset
```

This script is **fully autonomous** — no hardcoded UUIDs to update:
1. Reads current D1 UUIDs from `wrangler.jsonc` automatically
2. Exports all data to `scripts/db/data_exports/{timestamp}/` (SQL + JSON) before deletion
3. Deletes old D1 instances via CF REST API
4. Creates new fresh instances with canonical names
5. Patches `wrangler.jsonc` with new UUIDs
6. Archives old migrations to `migrations/_archive/{timestamp}/`
7. Chains: `db:generate:all → migrate:remote:all → deploy`

---

## Phase 5 — Post-Reset: Seed Prior Data

After `pnpm run db:reset` completes, inject the prior data back into the fresh instances:

```bash
# Step 1: Prepare seed files (normalize exports for D1 limits)
pnpm run db:seed:prep
# Or target a specific export dir:
# python3 scripts/db/seed_prep.py --export-dir scripts/db/data_exports/TIMESTAMP

# Step 2: Apply seeds to the newly created D1 instances
pnpm run db:seed:run
# Or target specific seeds:
# python3 scripts/db/seed_run.py --seeds-dir scripts/db/seeds/TIMESTAMP
```

### What seed_prep.py does:
- Truncates high-volume tables to last N rows: `system_logs`→2000, `webhook_deliveries`→500, etc.
- Chunks INSERT statements to respect D1 limits (100 params/query, 90 KB/statement)
- Writes SQL to `scripts/db/seeds/{timestamp}/DB.seed.sql` and `DB_WEBHOOKS.seed.sql`

### What seed_run.py does:
- Tries bulk `--file` execution (fastest)
- Falls back to statement-by-statement if bulk fails
- Classifies all known D1 error types with instructive fix messages
- Retries transient overload, aborts on fatal schema mismatches

### ⚠️ Seeding Rules:
- **NEVER** place seed files in `migrations/` — wrangler will treat them as migrations
- Seed files live in `scripts/db/seeds/{export_timestamp}/`
- If seeding fails with `D1_COLUMN_NOTFOUND` or `D1_TYPE_ERROR`, add the table to `TABLE_EXCLUDE` in `seed_prep.py` and re-run prep

---

## Phase 6 — Verify Post-Reset

After reset + seed, confirm data is flowing:

```bash
# Verify seed counts
wrangler d1 execute DB --remote --command "SELECT count(*) as c FROM system_logs;"
wrangler d1 execute DB_WEBHOOKS --remote --command "SELECT count(*) as c FROM webhook_deliveries;"

# Run full health suite
curl -X POST https://core-github-api.hacolby.workers.dev/api/health/run | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('status'), '-', len(d.get('results', [])), 'checks')"
```
