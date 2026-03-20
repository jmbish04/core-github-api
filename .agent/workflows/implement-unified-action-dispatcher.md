# Implement Unified Action Worker Integration

## Objective

Establish the outbound dispatch infrastructure and real-time inbound WebSocket API required for the Cloudflare Worker to delegate asynchronous workloads to the `unified-api-worker.yml` GitHub Action, while maintaining strict state tracking in D1.

## Steps

1. **D1 Schema:** Create `src/db/schemas/app/unified_action_logs.ts` with the required columns (`taskId`, `githubOwner`, `requestPayload`, etc.) to track all dispatched tasks.
2. **Modular Dispatcher:** Create `src/services/github/unified-action-worker/` and implement the base `dispatcher.ts` alongside individual task modules (`sync-templates.ts`, etc.) to cleanly separate payload construction from API transmission.
3. **WebSocket API Hub:** Implement the Hono WebSocket route (`/api/ws/action-worker`) equipped with a message router capable of executing specific Cloudflare-bound business logic (AI execution, D1 queries, Jules kickoffs, and CF API proxying).
4. **Cloudflare Proxy Logic:** Specifically build out the logic within the WS handler to resolve Cloudflare Pages/Workers projects using the provided `worker_name` or repository coordinates to fetch CI/CD build logs on behalf of the Action.
5. **Database Migration:** Run `drizzle-kit generate` to capture the new logging schema.
