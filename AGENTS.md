# System Routing Index

> **🚨 MIGRATION NOTICE (April 2026)**
> `AGENTS.md` is now purely a routing index to preserve context tokens. Core operational rules have been broken down into local `.agent/rules/` paths. If you need a rule, `view_file` the relevant file.

## 1. Localized Specialist Rules (MANDATORY CRAWL)

If you are working in one of these directories, you **MUST** read its local `AGENTS.md` or `AGENTS-REVIEW.md` file first:
- [Frontend Repo Actions Protocol](src/frontend/src/components/repo-actions/AGENTS-REVIEW.md)
- [Backend AI Agents Architecture](src/backend/src/ai/agents/AGENTS.md)
- [Backend MCP Tools Protocol](src/backend/src/ai/mcp/tools/AGENTS.md)
- [General Documentation](docs/AGENTS.md)

## 2. Global Agent Directives (.agent/rules/)

Depending on your task, load **ONLY** the relevant rule file(s):

| Domain | Target File | Handles |
|--------|-------------|---------|
| **AI Integration** | `.agent/rules/ai-rules.md` | `@google/genai` SDK, Structured Output, Provider Fallback & Routing |
| **Agent / DO State** | `.agent/rules/02-do-abstraction.md` | Official Agents SDK, WebSocket endpoints, SQLite configurations |
| **Pnpm / Infra** | `.agent/rules/workspace-awareness.md` | Monorepo sync, `pnpm dlx` commands, root installs |
| **Cloudflare** | `.agent/rules/cloudflare-standards.md` | Sandbox size limits, Bindings patch logic, OpenAPI setups |
| **Error / Logging** | `.agent/rules/traceability-logging.md` | D1 JSON mirror, 'Glass Box' principle, untruncated logs |
| **Drizzle ORM** | `.agent/rules/d1-drizzle-governance.md` | `DB_WEBHOOKS` vs `DB`, migration execution, health checks |
| **Webhooks** | `.agent/rules/github-webhooks.md` | Canonical Webhook URL logic, routing logic guarantees |
| **UI / Frontend** | `.agent/rules/03-responsive-design.md` | Mobile-first containers, sticky headers, standard icons |
| **Completion** | `.agent/rules/exit-criteria.md` | Verification bounds before task closure (`bun run dry-run`) |
| **Agent Delegation** | `.agent/rules/agent-specialist-delegation.md` | Specialist domain ownership (MCP → CloudflareAgent, Octokit → GithubAgent), CoordinatorAgent router contract |

*(For global commands, tool integration, and foundational context, refer to `000-bootstrap.md` or native user system instructions).*
