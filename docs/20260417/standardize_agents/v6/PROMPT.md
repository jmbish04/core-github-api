# v6 PROMPT — Comprehensive Agent Health Services

Read these first:
- `docs/20260417/standardize_agents/v6/PLAN.md` — architecture + rationale
- `docs/20260417/standardize_agents/v6/TASKS.json` — ordered execution plan

## Mission

Replace every trivial `healthProbe()` in the agents tree with **layered diagnostic-grade health checks**. The current state is unacceptable — most agents return `{ status: 'ok' }` whether they work or not. By end of this PR:

1. `BaseAgent` exposes a comprehensive backend health probe covering bindings, storage, skills, memory, HITL, and collaboration.
2. `BaseChatAgent` extends that with chat-specific checks, with a **user-triggered-only** Workers AI round-trip in deep mode.
3. Every agent subclass implements `agentHealthChecks()` covering its unique tools, skills, and collaboration partners.
4. Cron-driven health runs consume **zero Workers AI tokens**.

Work through TASKS.json in dependency order. Parallel groups are `[bracketed]`.

---

## Non-Negotiable Rules

1. **Fast mode is the default.** Any code path that calls a live model in `fast` mode is a bug. The only place models are called is chat-checks.ts C3, only when `mode === 'deep'`.
2. **The cron coordinator passes `mode: 'fast'`** — never deep. Cron-triggered Workers AI calls defeat the entire purpose of the split.
3. **Per-check timeout is hard.** 1500ms fast / 10000ms deep. Use `Promise.race`. A hung check must not block the probe.
4. **Skip ≠ fail.** Optional bindings (EDGRAPH, SKILLS_KV) absent → `skip`. Required bindings absent → `fail`.
5. **Peer binding resolution is Layer 2.** Peer RPC calls are Layer 3 — and only where the agent's core function genuinely depends on talking to that peer.
6. **State store round-trip must clean up after itself.** Use a sentinel key like `_health_probe` with ISO timestamp; delete after verification. Never leave probe artifacts in production state.
7. **HITL check is dry-run only.** `SELECT COUNT(*)` — do NOT insert a test proposal. That would pollute the real approval queue.
8. **Collaboration dry-run for WorkshopAgent (A5) inserts + deletes in a D1 batch.** No partial rows left behind if the probe crashes mid-way.
9. **The user explicitly called out StandardizationAgent as the benchmark for "unacceptable."** Task A11 fixing it is critical priority — treat the quality of A11's checks as the floor for every other agent.
10. **Return `HealthReport`, not ad-hoc shapes.** Every `healthProbe` exit point returns the interface defined in F1-TYPES.

---

## Critical Implementation Details

### F3-BASE-CHECKS — State store round-trip (B3)

```typescript
export function stateStoreRoundTrip(
  stateStore: AgentStateStore<any>,
  agentName: string,
  db: D1Database
): () => Promise<HealthCheck> {
  return async () => {
    const start = Date.now();
    const sentinel = `_health_probe_${Date.now()}`;
    try {
      await stateStore.patch({ [sentinel]: new Date().toISOString() } as any);
      const read = (stateStore.getState() as any)[sentinel];
      if (!read) throw new Error('sentinel not readable from DO SQLite');

      // Verify D1 mirror
      const row = await db.prepare(
        `SELECT key FROM agentStateMirror WHERE agent_name = ? AND key = ? LIMIT 1`
      ).bind(agentName, sentinel).first();
      if (!row) throw new Error('sentinel not mirrored to D1');

      // Cleanup
      await stateStore.patch({ [sentinel]: undefined } as any);

      return {
        name: 'state.roundtrip',
        layer: 2, category: 'storage',
        status: 'pass', durationMs: Date.now() - start,
        message: 'DO SQLite + D1 mirror round-trip ok',
      };
    } catch (e: any) {
      return {
        name: 'state.roundtrip',
        layer: 2, category: 'storage',
        status: 'fail', durationMs: Date.now() - start,
        error: e.message,
      };
    }
  };
}
```

### F4-CHAT-CHECKS — Stream shape (C2) with zero tokens

```typescript
import { streamText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

export function streamShapeSanity(env: Env): () => Promise<HealthCheck> {
  return async () => {
    const start = Date.now();
    try {
      if (!env.AI) throw new Error('env.AI binding missing');
      const workersai = createWorkersAI({ binding: env.AI });
      const probe = streamText({
        model: workersai('@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
        prompt: '__probe__',
        abortSignal: AbortSignal.timeout(0), // aborts before any request lands
      });
      if (typeof probe.toUIMessageStreamResponse !== 'function') {
        throw new Error('toUIMessageStreamResponse missing — ai-sdk version mismatch');
      }
      return {
        name: 'chat.stream.shape',
        layer: 2, category: 'chat',
        status: 'pass', durationMs: Date.now() - start,
        message: 'streamText shape intact (no tokens)',
      };
    } catch (e: any) {
      // AbortError is expected/success — the stream object was constructed correctly
      if (e?.name === 'AbortError' || e?.message?.includes('aborted')) {
        return {
          name: 'chat.stream.shape',
          layer: 2, category: 'chat',
          status: 'pass', durationMs: Date.now() - start,
        };
      }
      return {
        name: 'chat.stream.shape',
        layer: 2, category: 'chat',
        status: 'fail', durationMs: Date.now() - start,
        error: e.message,
      };
    }
  };
}
```

### F4-CHAT-CHECKS — Deep round-trip (C3)

```typescript
export function workersAiChatRoundTrip(env: Env): () => Promise<HealthCheck> {
  return async () => {
    const start = Date.now();
    try {
      const workersai = createWorkersAI({ binding: env.AI });
      const res = streamText({
        model: workersai('@cf/meta/llama-3.3-70b-instruct-fp8-fast'),
        prompt: 'Reply with exactly: OK',
      });
      let text = '';
      for await (const chunk of res.textStream) {
        text += chunk;
        if (text.length > 20) break;
      }
      if (!text.trim()) throw new Error('empty response');
      return {
        name: 'chat.model.roundtrip',
        layer: 2, category: 'model',
        status: 'pass', durationMs: Date.now() - start,
        message: `model responded in ${Date.now() - start}ms`,
        details: { preview: text.slice(0, 40) },
      };
    } catch (e: any) {
      return {
        name: 'chat.model.roundtrip',
        layer: 2, category: 'model',
        status: 'fail', durationMs: Date.now() - start,
        error: e.message,
      };
    }
  };
}
```

### B1-BASE-AGENT — Wiring example

```typescript
// In BaseAgent
protected abstract get peerAgentBindings(): Record<string, { bindingKey: string; required: boolean }>;
protected async agentHealthChecks(mode: HealthMode): Promise<HealthCheck[]> { return []; }

@callable()
public async healthProbe(opts?: { mode?: HealthMode }): Promise<HealthReport> {
  const mode: HealthMode = opts?.mode ?? 'fast';
  const start = Date.now();
  const timeoutMs = mode === 'deep' ? 10_000 : 1_500;

  const env = this.env as any;
  const baseFns = [
    bindingSanity(env, ['DB', 'AI'], ['EDGRAPH', 'SKILLS_KV']),
    aiProviderInit(this.ai),
    stateStoreRoundTrip(this.stateStore, this.agentName, env.DB),
    skillManagerReachability(this.ai, this.skills),
    edigraphConnectivity((this as any).memory),
    hitlQueueDryRun(env.DB, this.agentName),
    collabBindingResolution(env, this.peerAgentBindings),
  ];
  const customFns = (await this.agentHealthChecks(mode)).map(c => async () => c);

  const checks = await runChecks([...baseFns, ...customFns], { timeoutMs });
  return aggregateReport(this.agentName, mode, checks, Date.now() - start);
}
```

### A11-STANDARDIZATION — The benchmark fix

The existing code is exactly what must never exist anywhere in the tree again:
```typescript
async healthProbe() {
  return { status: 'ok', agent: 'StandardizationAgent', timestamp: new Date().toISOString() };
}
```

Replacement pattern:
```typescript
export class StandardizationAgent extends BaseAgent<StandardizationState> {
  protected get agentName() { return 'StandardizationAgent'; }
  protected get skills() { return ['style-guide', 'code-standards']; }
  protected get peerAgentBindings() {
    return { guardrail: { bindingKey: 'GUARDRAIL_AGENT', required: true } };
  }

  protected async agentHealthChecks(mode: HealthMode): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];
    const db = (this.env as any).DB;

    // Rule set loaded
    const ruleStart = Date.now();
    try {
      const row = await db.prepare('SELECT COUNT(*) as n FROM standardization_rules').first();
      const n = (row as any)?.n ?? 0;
      checks.push({
        name: 'rules.loaded', layer: 3, category: 'custom',
        status: n > 0 ? 'pass' : 'fail',
        durationMs: Date.now() - ruleStart,
        message: `${n} rules`,
      });
    } catch (e: any) {
      checks.push({ name: 'rules.loaded', layer: 3, category: 'custom',
        status: 'fail', durationMs: Date.now() - ruleStart, error: e.message });
    }

    // agent_inventory queryable
    // ... (same pattern)

    return checks;
  }
}
```

### C1-DETAILED-CHECK — Parallelism constraint

~11 agents × 2s serial = 22s — exceeds coordinator's 8s per-check budget. You MUST run per-agent probes in parallel inside `checkAgentsHealthDetailed`:

```typescript
const perAgent = await Promise.all(
  AGENTS_SDK_AGENTS.map(async (a) => {
    const binding = (env as any)[a.bindingKey];
    if (!binding) return { name: a.name, status: 'SKIPPED' as const };
    try {
      const stub: any = await getAgentByName(binding, 'health-probe');
      const report: HealthReport = await Promise.race([
        stub.healthProbe({ mode: 'fast' }),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('probe timeout')), 2000)),
      ]);
      return { name: a.name, report };
    } catch (e: any) {
      return { name: a.name, error: e.message, status: 'failure' as const };
    }
  })
);
```

---

## Verification (run before declaring done)

```bash
# Zero TS errors
npx tsc --noEmit

# Zero trivial stubs remain
rg -n "status:\s*['\"]ok['\"]" src/backend/src/ai/agents/ || echo "clean"
rg -B1 -A2 "healthProbe\(\)\s*\{" src/backend/src/ai/agents/ | grep -v "BaseAgent\|BaseChatAgent" | grep -c "status: 'ok'" # must be 0

# Dry-run deploy
pnpm run dry-run

# Fast probe roundtrip (<2s, 0 tokens consumed — check AI Gateway analytics after)
curl -X POST 'https://preview/api/agents/CloudflareAgent/health?mode=fast' | jq

# Deep probe (must include 1 model-category check)
curl -X POST 'https://preview/api/agents/OrchestratorAgent/health?mode=deep' \
  | jq '.checks[] | select(.category=="model")'

# Coordinator still green
curl 'https://preview/health' | jq '.results[] | select(.name=="agents" or .name | startswith("agents"))'

# Negative test: unbind a required peer in wrangler preview, redeploy,
# confirm that agent's probe reports fail on collabBindingResolution
```

---

## Commit Strategy

One commit per phase:
1. `feat(agents): health infrastructure — types, runner, base checks`
2. `feat(agents): layered healthProbe in BaseAgent + BaseChatAgent`
3. `feat(agents): per-agent Layer 3 health checks across all canonical agents`
4. `feat(agents): detailed coordinator integration + per-agent health route`
5. `chore(agents): deprecate trivial healthProbe stubs; verify zero remain`

Each commit must leave `npx tsc --noEmit` green.

---

## Out of Scope

- Frontend UI for the health dashboard (separate PR)
- AI-generated diagnosis (existing `/api/health/analyze` flow untouched)
- Alerting, notifications, or auto-remediation
- Historical trend analysis

Any work beyond TASKS.json should be flagged to the user, not silently undertaken.
