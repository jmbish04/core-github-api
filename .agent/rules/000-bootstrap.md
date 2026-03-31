---
trigger: always_on
---

# 000-bootstrap.md: Agent Genesis Directive

## Core Operating Procedure
1. **Initialize Context:** On the first turn of every session, read only `AGENTS.md` at the repo root to understand the system architecture and active specialist agents.
2. **Standardization Protocol:** All implementation must align with the `StandardizationAgent` logic defined in `src/ai/agents/StandardizationAgent.ts`.
3. **Lazy Load Rules:** Do NOT read all files in `.agent/rules/` by default. Instead, identify the relevant rules based on the task (e.g., read `ai-provider-standards.md` only for AI-related tasks).

## Environment Constraints
- **Primary IDE:** Google Antigravity.
- **Runtime:** Cloudflare Workers (workerd).
- **Stack:** Hono (API), Astro 6 (Frontend), Drizzle ORM (D1 Data Layer).
- **Architecture:** Unified Worker Assets with Cloudflare AI Gateway routing.

## Code Output Rules
- ALWAYS respond with full end-to-end code for the modified module.
- NEVER use shortcuts or "rest of code" comments.
- Ensure `integer('id').generatedAlwaysAsIdentity()` is used for all Drizzle primary keys per 2026 standards.
