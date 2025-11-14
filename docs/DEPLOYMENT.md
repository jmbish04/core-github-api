# Deployment Guide - Multi-Protocol GitHub Worker

This guide covers deploying the Multi-Protocol GitHub Worker with all its features including Durable Objects, WebSockets, and MCP support.

## Prerequisites

- Cloudflare account with Workers enabled
- wrangler CLI installed (`npm install -g wrangler`)
- GitHub Personal Access Token (for GitHub API operations)
- Worker API key (for authentication)

---

## 🚨 IMPORTANT: Durable Object Migrations

**This Worker includes Durable Object migrations and MUST be deployed using `wrangler deploy` for the first time.**

### Why?

The Worker includes a new Durable Object class (`RoomDO`) with a migration defined in `wrangler.jsonc`:

```jsonc
{
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["OrchestratorAgent", "RetrofitAgent"]
    },
    {
      "tag": "v2",
      "new_classes": ["RoomDO"]
    }
  ]
}
```

**Cloudflare requires migrations to be fully applied using `wrangler deploy` before you can use gradual deployments (`wrangler versions upload`).**

### Deployment Command

```bash
# First deployment (or when adding new Durable Objects)
npx wrangler deploy

# Subsequent deployments (after migration is complete)
npx wrangler versions upload  # Only after migration is live
```

### Error You Might See

If you try to use `wrangler versions upload` before deploying the migration:

```
Version upload failed. You attempted to upload a version of a Worker that includes
a Durable Object migration, but migrations must be fully applied by running
"wrangler deploy".
```

**Solution:** Run `npx wrangler deploy` instead.

---

## Step-by-Step Deployment

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Secrets

Set your secrets using wrangler:

```bash
# GitHub Personal Access Token
npx wrangler secret put GITHUB_TOKEN

# Worker API Key (for protecting API endpoints)
npx wrangler secret put WORKER_API_KEY
```

### 3. Review Configuration

Check `wrangler.jsonc` to ensure all bindings are correct:

- **Durable Objects**: `ORCHESTRATOR`, `RetrofitAgent`, `ROOM_DO`
- **D1 Database**: `DB` (update database_id and preview_database_id)
- **KV Namespace**: `ETAG_KV` (update id and preview_id)
- **Workflows**: `GITHUB_SEARCH_WORKFLOW`
- **Queues**: `SEARCH_QUEUE`
- **AI Binding**: `AI`

### 4. Run Database Migrations

If you're using D1:

```bash
# Apply migrations to preview database
npx wrangler d1 migrations apply core-github-api --local

# Apply migrations to production database
npx wrangler d1 migrations apply core-github-api --remote
```

### 5. Deploy the Worker

**First deployment or when adding new Durable Objects:**

```bash
npx wrangler deploy
```

This will:
- Deploy the Worker code
- Apply Durable Object migrations
- Set up all bindings
- Make the Worker live at your `*.workers.dev` domain

### 6. Verify Deployment

Test the deployment:

```bash
# Health check
curl https://your-worker.workers.dev/healthz

# OpenAPI documentation
curl https://your-worker.workers.dev/openapi.json

# MCP tools
curl https://your-worker.workers.dev/mcp-tools

# Landing page
open https://your-worker.workers.dev/landing.html
```

---

## Testing Protocols

### REST API

```bash
export API_KEY="your-worker-api-key"
export BASE_URL="https://your-worker.workers.dev"

curl -X POST "$BASE_URL/api/octokit/search/repos" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"q": "cloudflare workers", "per_page": 5}'
```

### WebSocket

```javascript
// Browser or Node.js
const ws = new WebSocket('wss://your-worker.workers.dev/ws?projectId=demo');
ws.onopen = () => console.log('Connected!');
ws.onmessage = (e) => console.log('Message:', JSON.parse(e.data));
ws.send(JSON.stringify({ type: 'ping', payload: { t: Date.now() } }));
```

### MCP

```bash
# List tools
curl "$BASE_URL/mcp-tools" | jq '.tools[] | {name, category}'

# Execute tool
curl -X POST "$BASE_URL/mcp-execute" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "searchRepositories",
    "params": {"q": "typescript", "per_page": 5}
  }' | jq
```

### RPC (Service Bindings)

In another Worker's `wrangler.jsonc`:

```jsonc
{
  "services": [
    {
      "binding": "GITHUB_WORKER",
      "service": "core-github-api",
      "entrypoint": "GitHubWorker"
    }
  ]
}
```

Then in your Worker code:

```typescript
const result = await env.GITHUB_WORKER.searchRepositories({
  q: 'cloudflare workers',
  per_page: 10
}, env);
```

---

## Gradual Deployments (After Migration)

Once the initial deployment is complete and migrations are applied, you can use gradual deployments:

### 1. Upload a New Version

```bash
npx wrangler versions upload
```

### 2. Deploy Gradually

```bash
# Deploy to 10% of traffic
npx wrangler versions deploy --percentage 10

# Increase to 50%
npx wrangler versions deploy --percentage 50

# Full rollout
npx wrangler versions deploy --percentage 100
```

### 3. Rollback if Needed

```bash
# List versions
npx wrangler versions list

# Rollback to previous version
npx wrangler versions deploy <version-id> --percentage 100
```

---

## Monitoring and Observability

### Cloudflare Dashboard

1. Go to **Workers & Pages** > Your Worker
2. View real-time metrics, logs, and analytics
3. Check Durable Object usage and WebSocket connections

### Structured Logs

The Worker logs structured JSON to D1:

```sql
SELECT * FROM request_logs
WHERE level = 'error'
ORDER BY timestamp DESC
LIMIT 100;
```

### Health Endpoint

Monitor the `/healthz` endpoint:

```bash
curl https://your-worker.workers.dev/healthz
```

Returns:

```json
{
  "ok": true,
  "timestamp": "2025-01-01T00:00:00Z",
  "version": "1.0.0"
}
```

---

## Troubleshooting

### Migration Errors

**Error:** "Durable Object migration failed"

**Solution:**
1. Check that class names in `wrangler.jsonc` match exported classes in `src/index.ts`
2. Ensure migrations are ordered correctly (v1, v2, etc.)
3. Run `npx wrangler deploy --dry-run` to validate configuration

### WebSocket Connection Failures

**Error:** "426 Upgrade Required"

**Solution:**
1. Ensure you're using `wss://` (not `ws://`) for production
2. Check that `ROOM_DO` Durable Object is deployed
3. Verify the migration is applied

### MCP Tool Execution Errors

**Error:** "Invalid parameters for tool"

**Solution:**
1. Check the tool's schema at `/mcp-tools`
2. Validate your parameters match the expected structure
3. Use Zod validation errors in the response for debugging

### API Authentication Failures

**Error:** "401 Unauthorized"

**Solution:**
1. Verify `WORKER_API_KEY` secret is set correctly
2. Pass API key via `x-api-key` header or `Authorization: Bearer <key>`
3. Check that the key matches exactly (no extra whitespace)

---

## Production Checklist

Before going live:

- [ ] All secrets configured (`GITHUB_TOKEN`, `WORKER_API_KEY`)
- [ ] D1 migrations applied to production database
- [ ] Durable Object migrations deployed via `wrangler deploy`
- [ ] Health endpoint returns `200 OK`
- [ ] All four protocols tested (REST, WebSocket, RPC, MCP)
- [ ] Monitoring and alerts configured in Cloudflare dashboard
- [ ] Custom domain configured (if needed)
- [ ] Rate limiting configured (if needed)
- [ ] CORS settings verified for `/api/*` endpoints
- [ ] Landing page accessible and links working

---

## Next Steps

- **Monitor Usage**: Track requests, errors, and latency in Cloudflare dashboard
- **Scale**: Adjust concurrency limits and CPU time as needed
- **Optimize**: Use caching (R2, KV) for frequently accessed data
- **Extend**: Add new MCP tools by following the pattern in `src/mcp/tools.ts`
- **Secure**: Implement rate limiting, IP allowlists, or JWT authentication

---

## Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Durable Objects Guide](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/)
- [WebSocket API](https://developers.cloudflare.com/workers/runtime-apis/websockets/)
- [Gradual Deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)

---

## Support

For issues or questions:

- GitHub Issues: https://github.com/jmbish04/github-worker/issues
- Cloudflare Community: https://community.cloudflare.com/
- Usage Examples: [docs/USAGE_EXAMPLES.md](./USAGE_EXAMPLES.md)
