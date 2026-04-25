# Rule: GitHub App Webhook Architecture (DO NOT VIOLATE)

## Canonical Webhook Endpoint (IMMUTABLE)

```
POST https://core-github-api.hacolby.workers.dev/api/webhooks
```

This URL is **configured in the GitHub App settings** and is the sole receiver of all GitHub events for the `jmbish04` organization. Any change to this path **WILL BREAK all webhook delivery** and must be accompanied by a corresponding update in the GitHub App settings.

### Implementation Details

| Property | Value |
|---|---|
| Route File | `src/backend/src/routes/api/webhooks/index.ts` |
| Route Mount | `src/backend/src/routes/index.ts` → `.route('/api/webhooks', webhooksApi)` |
| Internal Handler | `webhooksApi.post('/')` → `webhookHandler()` |
| External Path | `POST /api/webhooks` |
| D1 Storage | `DB_WEBHOOKS` → `webhook_deliveries` table |
| Env Var | `WEBHOOK_URL = "https://core-github-api.hacolby.workers.dev/api/webhooks"` (wrangler.jsonc) |
| Signature Secret | `GITHUB_WEBHOOK_SECRET` (Cloudflare Secret binding) |

### DO NOT

- ❌ Change the route segment from `/api/webhooks` to anything else
- ❌ Move `webhookHandler` to a sub-path like `/api/webhooks/events`
- ❌ Write webhook deliveries to `DB` (core) — they belong in `DB_WEBHOOKS`
- ❌ Remove signature verification (`x-hub-signature-256`) — this is the security boundary
- ❌ Remove the idempotency check — GitHub may re-deliver events

### GitHub App Authentication Tiers

| Operation | Auth Method |
|---|---|
| Receiving webhooks | Webhook secret (`GITHUB_WEBHOOK_SECRET`) |
| Reading delivery status | App JWT via `new App({ appId, privateKey })` |
| Acting on repos | Installation access token via `octokit.rest.apps.createInstallationAccessToken()` |

> **IMPORTANT**: App-level endpoints (`apps.getWebhookConfigForApp`, `apps.listWebhookDeliveries`) require
> a JWT generated from the App's private key. They CANNOT use installation tokens. Always use `githubApp.octokit`
> (the `App` class from `octokit` package) for these calls.

## Health Check

The GitHub App webhook health is monitored by a dedicated endpoint:

```
GET /api/health/github-app-webhooks
```

This checks:
1. That `webhookUrl` in the GitHub App config matches `env.WEBHOOK_URL`
2. That recent deliveries show a healthy success rate
3. Returns the count of failed deliveries from the last 50 events

See implementation in `src/backend/src/routes/api/ops/health.ts`.

## Historical Note

The root cause of `DB_WEBHOOKS` remaining empty (March 2026):  
- The GitHub App was configured to POST webhooks to `/webhooks` (missing the `/api` prefix).  
- The actual worker route is `/api/webhooks`.  
- Once the GitHub App setting was corrected, deliveries immediately started appearing as green in GitHub.  
- The `WEBHOOK_URL` env var in `wrangler.jsonc` was added to provide a single source of truth.
