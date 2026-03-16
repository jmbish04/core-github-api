---
description: Implement Universal AI Gateway REST Proxy
---

# Workflow: Implement Universal AI Gateway REST Proxy

**Objective:** Expose Cloudflare AI Gateway endpoints through the Hono API so that external GitHub Action python scripts can securely interface with Universal Routing.

1.  **File Creation:** Created the modular `backend/src/routes/api/ai/gateway.ts`, `backend/src/routes/api/ai/utils/format-model-id.ts`, and `backend/src/routes/api/ai/schemas/gateway.schema.ts` files.
2.  **Code Ingestion:** Built full TypeScript end-to-end functionality into each module.
3.  **Module Wiring:**
    - Navigated to the main routing registry (`backend/src/index.ts`).
    - Imported `gatewayApp` from the new module: `import aiGatewayApi from '@/routes/api/ai/gateway';`
    - Mounted the route: `app.route('/api/ai/gateway', aiGatewayApi);`
4.  **Environment Setup:** Update `.dev.vars` (and `wrangler.toml`/`wrangler.jsonc` `[vars]` block if typed validation exists) to ensure `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are active. Optionally add `GITHUB_ACTION_API_KEY` for dedicated auth isolation.
5.  **Validation:**
    - Run tests/CURL locally against `http://localhost:8787/api/ai/gateway/chat/completions`.
    - Send a generic `Authorization: Bearer <token>` and payload `{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "ping"}]}` to confirm universal routing passthrough and Zod schema compliance.
