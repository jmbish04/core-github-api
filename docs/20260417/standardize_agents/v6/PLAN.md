# v6 PLAN — Comprehensive Agent Health Services

## Context

v5/followup standardized agent foundations (BaseAgent, BaseChatAgent, skills, HITL, collaboration). What remains unacceptable is **health reporting**. Today's `healthProbe()` on most agents returns a bare `{ status: "ok" }` — it confirms only that the Durable Object resolved, nothing about whether the agent can actually perform its job. A probe that never fails is a probe that never tells you anything.

v6 replaces this with a **layered, diagnostic-grade health system** where every agent — by inheritance — exercises its real dependencies, and per-agent subclasses extend the baseline with tool-, skill-, and collaboration-specific checks that reflect each agent's actual responsibilities.

**Example of the current failure (StandardizationAgent):**
```typescript
async healthProbe() {
  return { status: 'ok', agent: 'StandardizationAgent', timestamp: new Date().toISOString() };
}
```
This tells an operator nothing. It returns `ok` when the agent is entirely broken.

**Output artifacts:**
- `docs/20260417/standardize_agents/v6/PLAN.md` (this file)
- `docs/20260417/standardize_agents/v6/TASKS.json`
- `docs/20260417/standardize_agents/v6/PROMPT.md`

---

## Architecture

### Three-Layer Health Model

```
┌────────────────────────────────────────────────────────────────┐
│ Layer 3: Per-Agent Checks       (agentHealthChecks() override) │
│   - Tool availability (MCP, GitHub, CF API, Jules, Stitch)     │
│   - Skill reachability (named skills resolve from D1)          │
│   - Collaboration partners (peer agent bindings reachable)     │
├────────────────────────────────────────────────────────────────┤
│ Layer 2: Base Class Checks      (inherited from Base*Agent)    │
│   BaseAgent:                                                   │
│     - Env binding sanity (DB, AI, EDGRAPH, required DOs)       │
│     - AIProvider initialized + AI Gateway reachable            │
│     - AgentStateStore DO-SQLite read/write + D1 mirror         │
│     - SkillManager D1 reachability + configured skills resolve │
│     - EdigraphService connectivity (if bound)                  │
│     - HitlQueue D1 insert/select round-trip (dry-run)          │
│     - CollaborationService: can resolve peer binding stubs     │
│   BaseChatAgent (extends BaseAgent):                           │
│     - AIChatAgent message array initialized                    │
│     - WebSocket broadcast path available (saveMessages exists) │
│     - streamText / toUIMessageStreamResponse shape intact      │
│     - [ON-DEMAND ONLY] Workers AI tiny-model round-trip        │
├────────────────────────────────────────────────────────────────┤
│ Layer 1: Probe Mechanics        (HealthReport shape + runner)  │
│   - Standard HealthReport interface                            │
│   - Parallel check execution with per-check timeout            │
│   - `mode: "fast" | "deep"` parameter                          │
│   - Aggregation → overall status (healthy/degraded/unhealthy)  │
└────────────────────────────────────────────────────────────────┘
```

### Fast vs Deep Mode

The health probe accepts a `mode` parameter:

| Mode | Caller | Budget | Includes |
|------|--------|--------|----------|
| `fast` | Cron coordinator (every 5 min) | ≤ 2s per agent | All Layer 1 + Layer 2 + Layer 3 checks **except** any that invoke a live model |
| `deep` | On-demand button from frontend | ≤ 30s per agent | Everything in `fast` + Workers AI chat round-trip (BaseChatAgent) + live tool calls (MCP query, GitHub API, CF API list) |

**Default is `fast`.** The cron-driven health coordinator MUST pass `mode: "fast"` — deep mode burns tokens and must be user-initiated only.

### HealthReport Shape

Every probe returns the same structured shape for UI consumption:

```typescript
interface HealthReport {
  agent: string;                 // "CloudflareAgent"
  status: "healthy" | "degraded" | "unhealthy";
  mode: "fast" | "deep";
  durationMs: number;
  timestamp: string;             // ISO8601
  checks: HealthCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;             // e.g. optional bindings not present
  };
}

interface HealthCheck {
  name: string;                  // "d1.agentStateMirror.roundtrip"
  layer: 1 | 2 | 3;
  category: "binding" | "storage" | "skill" | "memory" | "collab"
          | "tool" | "model" | "chat" | "custom";
  status: "pass" | "fail" | "skip";
  durationMs: number;
  message?: string;              // one-line human summary
  error?: string;                // stack or message if failed
  details?: Record<string, unknown>;
}
```

### Frontend Counterpart (BaseChatAgent only)

The on-demand deep probe triggered from the frontend follows this flow:

```
User clicks "Run Deep Health" on agent detail page
   ↓
Frontend hits POST /api/agents/:agentName/health?mode=deep
   ↓
Worker route calls agent stub → healthProbe({ mode: "deep" })
   ↓
BaseChatAgent deep path additionally:
  • Streams a synthetic prompt through Workers AI (@cf/meta/llama-3.3-70b-instruct-fp8-fast)
  • Verifies streamText → toUIMessageStreamResponse produces a ReadableStream
  • Reads first chunk to confirm assistant-ui compatible parts format
  • Times total round-trip
   ↓
Response returned to frontend
   ↓
Frontend renders HealthReport with per-check drilldown + Workers AI round-trip metric
```

**Why this split matters:** cron runs every 5 min × ~11 agents × per-probe Workers AI call ≈ 132 extra model calls/hour for zero operational value. Deep mode is opt-in.

---

## Layer 2: BaseAgent Required Checks

Every BaseAgent (both backend and chat) runs these in both `fast` and `deep` modes:

### B1. Env Binding Sanity
Iterate a static list of required bindings (`DB`, `AI`, optional `EDGRAPH`, `SKILLS_KV`, plus all peer agent bindings declared via a new `peerAgentBindings` abstract getter). Each missing required binding → `fail`. Missing optional → `skip`.

### B2. AIProvider Initialization
- `this.ai` is defined and instance of `AIProvider`
- `this.ai.skills` is defined (SkillManager attached)
- AI Gateway probe: `HEAD` to AI Gateway health endpoint (no tokens consumed)

### B3. AgentStateStore Round-Trip
- Write sentinel row to DO SQLite (`_health_probe` key with timestamp)
- Read back, assert equality
- Verify D1 mirror write landed in `agentStateMirror` (SELECT WHERE agent_name = self AND key = '_health_probe')
- Clean up sentinel row

### B4. SkillManager Reachability
- Query D1 `agent_skills` table (COUNT(*) — cheap)
- For each skill in `this.skills`, call `ai.skills.getSkillInstructions([name])` — must return non-empty content
- Check SkillManager in-memory cache size (report as detail, not pass/fail)

### B5. EdigraphService Connectivity (if bound)
- If `env.EDGRAPH` present: `this.memory.ping()` or equivalent lightweight call
- If binding absent: `skip` (not all agents use memory)

### B6. HitlQueue Dry-Run
- `SELECT COUNT(*) FROM hitlQueue WHERE owner_agent = self` — proves D1 table exists and is queryable
- Does NOT insert a test proposal (would pollute real queue)

### B7. Collaboration Binding Resolution
- For each peer declared in `peerAgentBindings`, call `env[bindingKey].idFromName('health-probe')` and `.get(id)` — confirms DO binding resolves
- Does NOT call any RPC on the peer (that's Layer 3 for agents that explicitly need it)

---

## Layer 2: BaseChatAgent Additional Checks

Inherits all B1–B7, plus:

### C1. AIChatAgent Internals
- `this.messages` is initialized to an Array
- `typeof this.saveMessages === 'function'`
- `typeof this.broadcast === 'function'`

### C2. Stream Shape Sanity (no inference)
- Construct a `streamText` call with `abortSignal: AbortSignal.timeout(0)` (aborts immediately)
- Verify `result.toUIMessageStreamResponse` is a function
- Catches abort error — success means the object shape is intact without consuming tokens
- **Runs in `fast` mode** — no tokens burned

### C3. Workers AI Chat Round-Trip (DEEP ONLY)
- Only runs when `mode === "deep"`
- Calls `streamText({ model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"), prompt: "Reply with: OK" })`
- Consumes the stream until completion or 10s timeout
- Verifies the decoded text is non-empty
- Reports total round-trip ms
- On failure → marks C3 as `fail`; overall status → `degraded` (chat-dependent agents)

---

## Layer 3: Per-Agent Specialized Checks

Every agent overrides `protected async agentHealthChecks(mode): Promise<HealthCheck[]>` to add its domain-specific checks. Examples below are illustrative — the full matrix lives in TASKS.json.

### CloudflareAgent
- **T1**: MCP `cloudflare-docs` endpoint returns 200 on a known query (fast: HEAD only; deep: real search call)
- **T2**: CF API `accounts` list (fast: HEAD; deep: GET + parse)
- **T3**: Can resolve `wrangler.jsonc` / `wrangler.toml` schema parser (unit-style local check — no network)
- **T4**: Sentinel binding lookup — given a known deployed worker script, verify `workers_get_worker` returns metadata
- **T5**: Can resolve peer `GITHUB_AGENT` binding (for repo scanning collaboration)
- **T6**: Cloudflare Docs MCP tool is listed in `env.MCP` registry + responsive ping

### EngineerAgent
- **T1**: Jules MCP server reachable (HEAD + list tools)
- **T2**: `JULES_SESSION_MANAGER` DO binding resolves
- **T3**: GitHub API `/user` call (fast: HEAD auth only; deep: full GET)
- **T4**: Peer binding `CLOUDFLARE_AGENT` resolves (for binding consultation)
- **T5**: Peer binding `GUARDRAIL_AGENT` resolves (for code review handoff)

### GuardrailAgent
- **T1**: Golden-path rule set loaded (SELECT COUNT FROM guardrail_rules > 0)
- **T2**: Peer binding `CLOUDFLARE_AGENT` resolves (for CF-standard consultation)
- **T3**: Peer binding `ENGINEER_AGENT` resolves
- **T4**: Code-standards skill content resolves

### GithubAgent
- **T1**: GitHub App authenticated (installation token obtainable)
- **T2**: Octokit client constructed without error
- **T3**: Webhook signature verifier loaded

### WorkshopAgent
- **T1**: Peer bindings `DESIGN_AGENT`, `ENGINEER_AGENT`, `CLOUDFLARE_AGENT`, `GUARDRAIL_AGENT` all resolve
- **T2**: `jules-stitch-loop` skill resolves
- **T3**: Collaboration service can open a dry-run session (create + immediately close D1 row in `collaboration_sessions`)

### DesignAgent
- **T1**: Stitch MCP reachable (HEAD)
- **T2**: `stitch-pipeline` skill resolves
- **T3**: Peer `ENGINEER_AGENT` binding resolves

### ResearchAgent
- **T1**: Search provider API reachable (fast: HEAD)
- **T2**: Vectorize binding resolves
- **T3**: Research skills (`plan-writing`, `brainstorming`) resolve

### LearningAgent
- **T1**: CI healer queue table queryable
- **T2**: HitlQueue specifically for type `ci-heal` queryable
- **T3**: Peer `ENGINEER_AGENT` resolves

### OrchestratorAgent
- **T1**: All managed peer bindings resolve (every other agent)
- **T2**: Orchestration skill resolves
- **T3**: Task assignment table queryable

### CollaborationSpace
- **T1**: `thread_participants` table queryable
- **T2**: WebSocket subscriber table queryable

### StandardizationAgent (the example that prompted this)
Currently returns `{ status: 'ok' }`. Replacement:
- **T1**: Standardization rule set loaded
- **T2**: Peer `GUARDRAIL_AGENT` binding resolves (for handoff)
- **T3**: Style-guide skill resolves
- **T4**: Can query `agent_inventory` table (what it standardizes against)

---

## Coordinator Integration

### New check: `checkAgentsHealthDetailed`

Replaces the current `checkHealth` in `ai/providers/index.ts` (which only verifies DO binding resolution — Layer 1 only).

```typescript
// src/backend/src/ai/providers/health-detailed.ts
export async function checkAgentsHealthDetailed(env: Env): Promise<HealthStepResult> {
  // Iterate AGENTS_SDK_AGENTS
  // For each: getAgentByName → stub.healthProbe({ mode: "fast" }) with 2s timeout
  // Aggregate into single HealthStepResult
}
```

Wire into `health/coordinator.ts` CODE_CHECKS registry as a replacement (not an addition — remove the old `agents` entry).

### New route: `POST /api/agents/:agentName/health`

- Query param `?mode=fast|deep` (default fast)
- Frontend "Run Deep Health" button hits this with `?mode=deep`
- Response: `HealthReport`
- Auth: existing admin guard

---

## Decisions

1. **No alerting/notification logic in v6.** Surfacing failures to users is a frontend concern; v6 delivers the data, not the UI.
2. **No AI-generated diagnosis inline.** Existing pattern: `POST /api/health/analyze` runs after-the-fact. Preserved.
3. **Reuse existing HealthStepResult** for coordinator integration; introduce new `HealthReport` for per-agent detail.
4. **Deep mode is explicit, never inferred.** No "fallback to deep on first failure" — that silently burns tokens.
5. **Skip ≠ fail.** Optional bindings (EDGRAPH, SKILLS_KV) missing should report as `skip`, not fail the probe.
6. **Per-check timeout: 1.5s in fast mode, 10s in deep.** Enforced via Promise.race.
7. **Peer binding resolution only in Layer 2.** Peer RPC *calls* only in Layer 3, and only for agents whose core purpose depends on that peer.

---

## Files

### New
- `src/backend/src/ai/providers/agent-support/health/types.ts` — `HealthReport`, `HealthCheck` interfaces
- `src/backend/src/ai/providers/agent-support/health/runner.ts` — `runChecks(checkFns, timeoutMs)` parallel executor
- `src/backend/src/ai/providers/agent-support/health/base-checks.ts` — B1–B7 check factories
- `src/backend/src/ai/providers/agent-support/health/chat-checks.ts` — C1–C3 check factories
- `src/backend/src/ai/providers/agent-support/health/index.ts` — barrel
- `src/backend/src/ai/providers/health-detailed.ts` — new coordinator entry point
- `src/backend/src/routes/api/agents/health.ts` — new `POST /api/agents/:agentName/health` route

### Modified
- `src/backend/src/ai/providers/agent-support/base-agent.ts` — replace trivial `healthProbe()` with layered version; add `peerAgentBindings` abstract getter; add `agentHealthChecks()` hook
- `src/backend/src/ai/providers/agent-support/base-chat-agent.ts` — same + C1–C3
- `src/backend/src/ai/providers/agent-support/index.ts` — export health types
- `src/backend/src/health/coordinator.ts` — swap `checkAgentsHealth` → `checkAgentsHealthDetailed`
- All agent `index.ts` files under `src/backend/src/ai/agents/*/` — implement `agentHealthChecks()` + `peerAgentBindings`
- Any existing per-agent `health.ts` files — refactor to return `HealthCheck[]` consumed by the new probe, not a standalone HealthStepResult
- `src/backend/src/ai/agents/GuardrailAgent/todo_integration/StandardizationAgent.ts` — replace the trivial `healthProbe()` (user explicitly called out)

### Deleted
- None (existing `health.ts` per-agent files get refactored, not deleted)

---

## Verification

```bash
# Type-check
npx tsc --noEmit

# Fast probe (what cron runs) — all checks pass, under 2s each
curl -X POST 'https://core-github-api.hacolby.workers.dev/api/agents/CloudflareAgent/health?mode=fast' | jq '.durationMs, .summary'

# Deep probe (what frontend button runs) — includes Workers AI round-trip
curl -X POST 'https://core-github-api.hacolby.workers.dev/api/agents/OrchestratorAgent/health?mode=deep' | jq '.checks[] | select(.category == "model")'

# Coordinator integration — agents category now shows per-agent check counts
curl 'https://core-github-api.hacolby.workers.dev/health' | jq '.results[] | select(.category == "agents")'

# Negative test — simulate broken state by renaming DB binding, confirm B3 fails
# Negative test — remove a skill name from agent config, confirm B4 fails for that skill
# Negative test — peer binding unbound, confirm B7 reports fail (required) or skip (optional)

# Token-usage audit — cron runs 12× per hour; confirm no Workers AI calls land
# in the AI Gateway analytics during that period (look for @cf/meta/llama-3.3 logs)
```

---

## Out of Scope (defer to v7+)

- Frontend "Run Deep Health" UI component (separate frontend PR)
- Historical health trend visualization
- Auto-remediation actions (e.g. "agent unhealthy → cycle DO")
- Notifier integrations (Slack, PagerDuty)
- Health-based agent gating (e.g. Orchestrator refuses assignments to unhealthy agents)
