# Unified Action Worker Constraints

- **Single Source of Truth:** All cross-repository template syncing, heavy scraping, and complex Git mutations belong in `unified-api-worker.yml` (located in `core-github-standardization`). The Cloudflare Worker strictly acts as the orchestrator and state manager.
- **Modular Dispatching:** Never hardcode disparate task payloads into a single massive function. Each task type MUST have its own dedicated module in `src/services/github/unified-action-worker/` that exports a strongly-typed function.
- **WebSocket Delegation:** The GitHub Action is ephemeral and lacks direct access to the Cloudflare internal network bindings (D1, AI, DOs). It MUST use the WebSocket API to request the Cloudflare Worker to run DB queries, execute LLM prompts via bindings, or query the CF v4 API using the Worker's injected secrets.
- **State Tracking:** Every dispatch must generate a `taskId` (UUID) before firing. This UUID is passed to the GitHub Action, which must echo it back during WebSocket connections and final webhook completions so the D1 `unified_action_logs` record can be updated securely.
