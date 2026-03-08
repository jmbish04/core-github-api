/**
 * @file backend/src/config/jules-standards.ts
 * @description Architecture standards injected into every Jules coding session.
 *
 * `JULES_STANDARDS` is appended to all Jules prompts (after the user task and
 * the mandatory webhook reporting instruction) to enforce project-specific
 * architectural conventions.
 *
 * ## Usage
 * This string is combined with the task prompt and webhook instruction in
 * `JulesService.startSession()`. Update this file to change the constraints
 * Jules uses across ALL sessions — changes take effect immediately on the
 * next session.
 *
 * @module Config
 */

/**
 * Project-wide coding standards enforced on all Jules coding sessions.
 * Describes the stack, patterns, and mandatory reporting protocol.
 */
export const JULES_STANDARDS = `
# Core GitHub API — Architecture Standards for Jules

## 1. Stack & Frameworks
- **Runtime**: Cloudflare Workers (Hono framework). No Node.js APIs.
- **Database**: Drizzle ORM with D1 (SQLite). ID columns must be \`integer('id').primaryKey({ autoIncrement: true })\` or \`text('id').primaryKey()\` (UUID).
- **AI**: Google Gemini via \`@google/genai\` SDK or Workers AI fallback. NEVER use \`@google/generative-ai\`.
- **Agents**: \`@cloudflare/agents\` SDK for stateful, long-running Durable Objects.

## 2. Code Patterns
- **TypeScript**: Strict mode. Minimize \`any\` usage; cast explicitly where required.
- **OpenAPI**: All public routes should use \`@hono/zod-openapi\` and be fully typed.
- **Directory Structure**:
  - \`src/routes/api/\` — Hono route handlers (co-located by domain)
  - \`src/db/schemas/\` — Drizzle ORM schema files, one domain per folder
  - \`src/services/\` — Business logic services (one directory per domain)
  - \`src/ai/agents/\` — Cloudflare Durable Object agents
  - \`src/do/\` — Supporting Durable Objects (non-agent)

## 3. Jules & Automation
- **Agent Scheduling**: Use \`this.schedule()\` for recurring background tasks.
- **Octokit**: Use the pre-configured Octokit instance from \`@services/github\`.
- **Webhooks**: GitHub webhooks are validated in \`src/routes/api/webhooks/\`.

## 4. Webhook Reporting (MANDATORY — see the reporting instruction above)
Jules MUST report status via the provided webhook endpoints at every step.

Endpoint reference:
- **Progress updates**: \`POST /api/webhooks/jules/status\`  
  Payload: \`{ jules_session_id, step_name, message, progress_pct? }\`
- **Lifecycle events**: \`POST /api/webhooks/jules/event\`  
  Payload: \`{ jules_session_id, event_type, message }\`
  event_type: \`blocked | needs_context | ready_for_pr | done | info\`

These callbacks enable the real-time frontend dashboard and agent memory
retrieval. Omitting them is a protocol violation.
`;
