export const JULES_STANDARDS = `
# Core GitHub API Architecture Standards

## 1. Stack & Frameworks
- **Runtime**: Cloudflare Workers (Hono framework).
- **Database**: Drizzle ORM with D1 (SQLite). ID columns must be \`integer('id').primaryKey({ autoIncrement: true })\`.
- **AI**: Google Gemini via \`@google/genai\` or Workers AI fallback.
- **Agents**: \`@cloudflare/agents\` SDK for stateful, long-running processes.

## 2. Code Patterns
- **Strict TypeScript**: No \`any\` unless absolutely necessary (and casted).
- **OpenAPI**: All routes must use \`@hono/zod-openapi\` and be fully typed.
- **Directory Structure**: 
    - \`src/routes/api/\` for endpoints.
    - \`src/db/schemas/\` for Drizzle schemas.
    - \`src/agents/\` for Durable Objects/Agents.

## 3. Jules & Automation
- **Agent Scheduling**: Use \`this.schedule()\` for background tasks.
- **Octokit**: Use the pre-configured instance.
- **Webhooks**: Validated via \`webhook-handler.ts\`.
`;
