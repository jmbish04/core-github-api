# MISSION: Refactor Agent Skills Implementation to 2026 Progressive Disclosure Standard

As a Codex Senior Engineer, analyze the existing `src/services/octokit/skill-fetcher.ts`, `src/db/schemas/agents/skills.ts`, and `src/routes/api/skills.ts`.

Refactor the skills architecture to implement the 3-Tier Progressive Disclosure Framework:

### TIER 1: Catalog & Discovery

- Update `onStart` / `onConnect` logic in the Agent classes (refer to `src/ai/agents/`) to perform semantic discovery.
- Use `env.VECTORIZE` to query for the top 5 relevant skills based on user intent.
- Inject only `name` and `description` into the system prompt. Do NOT load full markdown yet.

### TIER 2: Activation (Instruction Load)

- Implement a `load_skill` tool in `src/ai/mcp/tools/index.ts`.
- This tool must fetch the full `SKILL.md` body from the `SKILLS_FS` (R2 Bucket).
- Update the agent's internal state (Durable Object storage) to mark the skill as "Active".

### TIER 3: Deep Dive (Resources & Scripts)

- Implement a `read_reference` tool.
- This tool should access the `/references/` or `/scripts/` subdirectories in R2 for the activated skill.
- Use this to handle high-cardinality data like OpenAPI specs found in `src/schemas/apiSchemas.ts`.

### STORAGE SYNC

- Improve `skill-fetcher.ts` to create a "Sync Pipeline":
  1. Fetch repo contents via Octokit.
  2. Filter for `SKILL.md`.
  3. Upload raw files to R2.
  4. Generate embeddings for the `description` field and upsert to Vectorize.

### CONSTRAINTS:

- Use `AIChatAgent` patterns for WebSocket stability.
- Ensure all logic survives DO hibernation using `this.ctx.storage`.
- Target OpenAPI v3.1.0 for all skill-related endpoints.
