# Agent Skills Service Standards

## 1. Skill Storage Model
- Skills MUST NOT be fetched directly from GitHub during active AI inference.
- They must be ingested "out-of-band" into the D1 `agent_skills` table using the `/api/skills/ingest` or `/api/skills/ingest-structured` routes.
- The `SkillManager` service (`@/ai/providers/agent-support/skills.ts`) is the sole interface for skill resolution at inference time.

## 2. Provider-Level Injection
- Backend Agents must define skills using the `options: { skills: ['skill-name'] }` array passed to `AIProvider` generation methods.
- The `AIProvider` is solely responsible for querying `SkillManager`, which reads from D1 and caches in-memory with TTL.
- Chat agents receive dynamic skills via the `X-Agent-Skills` HTTP header, merged with static agent-defined skills in `resolveSystemPrompt()`.

## 3. Drizzle ORM Syntax
- Always use the `drizzle-zod` package for schema validation. Do NOT use `drizzle-orm/zod` (v1.0.0+ only).
- Schema definitions for agents live under `@db/schemas/agents/`.
- New relational tables (`agent_skill_allowed_tools`, `agent_skill_references`) use cascading FKs to `agentSkills.id`.

## 4. Additive API Changes
- When modifying Hono routes in production, favor ADDING new endpoints over destructively modifying existing ones.
- Example: `/ingest-structured` was added alongside the existing `/ingest` to prevent breaking active frontend clients.

## 5. Graceful Degradation
- Always parse external markdown and YAML frontmatter defensively.
- Do NOT fail a D1 insert if optional fields like `allowed-tools` are missing from SKILL.md.
- Default to an empty array and proceed with the core skill insertion.

## 6. Environment Variables
- AI generation tasks must exclusively use `GEMINI_API_KEY`.
- Skill ingestion routes use `GITHUB_TOKEN` via the existing `getOctokit()` service.
