---
description: Implement Cloudflare Changelog RSS Ingestion — full end-to-end guide
---

# Implement Cloudflare RSS Changelog Intelligence Stream

## Overview

This workflow adds a Cloudflare Changelog RSS scanner to the existing daily research pipeline. It fetches `https://developers.cloudflare.com/changelog/index.xml`, filters for stack-relevant entries, AI-summarizes each one, persists to D1, and injects the results into the daily research email.

---

## Files Created / Modified

| Status   | File                                                                 | Purpose                                     |
|----------|----------------------------------------------------------------------|---------------------------------------------|
| ✅ NEW    | `src/backend/src/db/schemas/app/cloudflare_changelog.ts`            | D1 Drizzle table definition                 |
| ✅ MOD    | `src/backend/src/db/schemas/app/index.ts`                           | Barrel export for new table                 |
| ✅ NEW    | `src/backend/src/workflows/research/cloudflare-changelog.ts`        | 4-step durable ingestion workflow           |
| ✅ MOD    | `src/backend/src/workflows/exports.ts`                              | Re-export `CloudflareChangelogWorkflow`      |
| ✅ MOD    | `src/backend/src/routes/api/frontend/research/daily-research-ingest.ts` | Fire-and-forget workflow trigger       |
| ✅ MOD    | `src/backend/src/utils/email/templates/base/email-fallback.hbs`     | Added ⚡ Cloudflare Changelog section        |
| ✅ MOD    | `src/backend/src/utils/email/send/repo-discovery.ts`                | Queries D1 + marks rows emailed             |
| ✅ MOD    | `wrangler.jsonc`                                                     | Registers `CLOUDFLARE_CHANGELOG_WORKFLOW`    |
| ✅ MOD    | `worker-configuration.d.ts`                                         | Added `CLOUDFLARE_CHANGELOG_WORKFLOW` type   |

---

## Migration Commands (Run After Schema Changes)

```bash
# Generate the Drizzle migration file
pnpm run db:generate:core

# Apply to local dev D1
pnpm run migrate:local:core

# Apply to production D1
pnpm run migrate:remote:core
```

---

## Verification Steps

### 1. TypeScript Build
```bash
pnpm run check
# Expected: exit code 0, zero errors
```

### 2. Wrangler Dry-Run
```bash
pnpm run dry-run
# Expected: all bindings resolve, --dry-run exit
```

### 3. Smoke Test — Workflow Trigger
```bash
# POST to the ingest endpoint — this spawns the CF changelog workflow
curl -X POST https://core-github-api.hacolby.workers.dev/api/frontend/daily-research/ingest \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test","status":"pass","findings":[]}'

# Then watch logs for:
# [DailyResearch] Spawned CloudflareChangelogWorkflow
# [CF-Changelog] Fetched N total items, N stack-relevant
# [CF-Changelog] Persisted N new entries to D1.
```

### 4. Verify D1 Rows
```bash
wrangler d1 execute DB --remote --command "SELECT id, title, emailed FROM cloudflare_changelog LIMIT 5;"
```

### 5. Email Render Verification
Trigger the email sender (any mechanism that calls `sendRepoDiscoveryEmail`) and inspect the HTML output for the `⚡ Cloudflare Changelog` section appearing below the GitHub repos block.

---

## Re-Generating Types After Next Deploy

The `CLOUDFLARE_CHANGELOG_WORKFLOW` binding was manually added to `worker-configuration.d.ts`. After deploying, regenerate the types to keep the file in sync:

```bash
wrangler types
```
