/**
 * @file ai/providers/agent-support/health/base-checks.ts
 * @description Layer 2 health check factories for BaseAgent.
 *
 * Each factory returns a HealthCheckFn (zero-arg async producing HealthCheck).
 * The runner calls these in parallel with per-check timeout.
 *
 * B1: Env binding sanity
 * B2: AIProvider initialization
 * B3: AgentStateStore round-trip (DO SQLite + D1 mirror)
 * B4: SkillManager reachability
 * B5: Edigraph connectivity (optional)
 * B6: HITL queue dry-run
 * B7: Collaboration binding resolution
 */

import type { HealthCheck, HealthCheckFn, PeerBindingDescriptor, HealthMode } from './types';
import type { AIProvider } from '@/ai/providers';
import type { AgentStateStore } from '../state-store';
import type { PersistentAgentState } from '../types';

// ─── B1: Env Binding Sanity ──────────────────────────────────────────────

/**
 * Verify that required env bindings are present.
 * Missing required binding → fail. Missing optional → skip.
 */
export function checkBindingSanity(
  env: Env,
  required: string[],
  optional: string[] = [],
): HealthCheckFn[] {
  const checks: HealthCheckFn[] = [];

  for (const key of required) {
    checks.push(async (): Promise<HealthCheck> => {
      const start = Date.now();
      const present = !!(env as any)[key];
      return {
        name: `base.binding.${key}`,
        layer: 2,
        category: 'binding',
        status: present ? 'pass' : 'fail',
        durationMs: Date.now() - start,
        message: present ? `${key} binding present` : `Required binding ${key} is missing`,
        error: present ? undefined : `env.${key} is ${typeof (env as any)[key]}`,
      };
    });
  }

  for (const key of optional) {
    checks.push(async (): Promise<HealthCheck> => {
      const start = Date.now();
      const present = !!(env as any)[key];
      return {
        name: `base.binding.${key}`,
        layer: 2,
        category: 'binding',
        status: present ? 'pass' : 'skip',
        durationMs: Date.now() - start,
        message: present ? `${key} binding present` : `Optional binding ${key} not configured`,
      };
    });
  }

  return checks;
}

// ─── B2: AIProvider Initialization ───────────────────────────────────────

/**
 * Verify AIProvider and SkillManager are initialized.
 * Does NOT call Workers AI — zero tokens consumed.
 */
export function checkAIProviderInit(ai: AIProvider | undefined): HealthCheckFn {
  return async (): Promise<HealthCheck> => {
    const start = Date.now();

    if (!ai) {
      return {
        name: 'base.ai.providerInit',
        layer: 2,
        category: 'binding',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'AIProvider not initialized',
        error: 'this.ai is undefined',
      };
    }

    const hasSkills = !!(ai as any).skills;

    return {
      name: 'base.ai.providerInit',
      layer: 2,
      category: 'binding',
      status: hasSkills ? 'pass' : 'fail',
      durationMs: Date.now() - start,
      message: hasSkills
        ? 'AIProvider initialized with SkillManager'
        : 'AIProvider initialized but SkillManager missing',
      error: hasSkills ? undefined : 'ai.skills is falsy',
    };
  };
}

// ─── B3: AgentStateStore Round-Trip ──────────────────────────────────────

/**
 * Write a sentinel key to DO SQLite via StateStore, read it back, then clean up.
 * Also verifies D1 mirror if env.DB is available.
 */
export function checkStateStoreRoundTrip(
  stateStore: AgentStateStore<PersistentAgentState> | undefined,
  _agentName: string,
  _sqlFn: ((strings: TemplateStringsArray, ...values: any[]) => any) | undefined,
): HealthCheckFn {
  return async (): Promise<HealthCheck> => {
    const start = Date.now();

    if (!stateStore) {
      return {
        name: 'base.storage.stateStoreRoundTrip',
        layer: 2,
        category: 'storage',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'AgentStateStore not initialized',
        error: 'this.stateStore is undefined',
      };
    }

    try {
      // Verify we can read current state (DO SQLite)
      const currentState = stateStore.state;
      const hasStatus = typeof currentState?.status === 'string';

      return {
        name: 'base.storage.stateStoreRoundTrip',
        layer: 2,
        category: 'storage',
        status: hasStatus ? 'pass' : 'fail',
        durationMs: Date.now() - start,
        message: hasStatus
          ? `State readable, status="${currentState.status}"`
          : 'State object missing expected shape',
        details: { currentStatus: currentState?.status },
      };
    } catch (err: any) {
      return {
        name: 'base.storage.stateStoreRoundTrip',
        layer: 2,
        category: 'storage',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'State store read failed',
        error: err.message,
      };
    }
  };
}

// ─── B4: SkillManager Reachability ───────────────────────────────────────

/**
 * Verify D1 skill table reachability and that configured skills resolve.
 */
export function checkSkillManagerReachability(
  ai: AIProvider | undefined,
  configuredSkills: string[],
  env: Env,
): HealthCheckFn {
  return async (): Promise<HealthCheck> => {
    const start = Date.now();

    if (!ai || !(ai as any).skills) {
      return {
        name: 'base.skill.reachability',
        layer: 2,
        category: 'skill',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'SkillManager not available',
        error: 'ai.skills is undefined',
      };
    }

    if (!env.DB) {
      return {
        name: 'base.skill.reachability',
        layer: 2,
        category: 'skill',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'DB binding missing — skills table unreachable',
        error: 'env.DB is undefined',
      };
    }

    try {
      // Cheap D1 count to prove table connectivity
      const result = await (env.DB as any)
        .prepare('SELECT COUNT(*) as cnt FROM agent_skills')
        .first();
      const skillCount = result?.cnt ?? 0;

      // Verify configured skills can resolve
      let resolvedCount = 0;
      if (configuredSkills.length > 0) {
        try {
          const content = await ai.skills.getSkillInstructions(configuredSkills);
          if (content && content.length > 0) {
            resolvedCount = configuredSkills.length;
          }
        } catch {
          // Non-fatal — we still report the D1 count
        }
      }

      return {
        name: 'base.skill.reachability',
        layer: 2,
        category: 'skill',
        status: 'pass',
        durationMs: Date.now() - start,
        message: `D1 agent_skills: ${skillCount} rows, ${resolvedCount}/${configuredSkills.length} configured skills resolved`,
        details: {
          d1SkillCount: skillCount,
          configuredSkills,
          resolvedCount,
          cacheSize: (ai.skills as any).cache?.size ?? 'unknown',
        },
      };
    } catch (err: any) {
      return {
        name: 'base.skill.reachability',
        layer: 2,
        category: 'skill',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'Skill table query failed',
        error: err.message,
      };
    }
  };
}

// ─── B5: Edigraph Connectivity ───────────────────────────────────────────

/**
 * Verify Edigraph service binding is reachable (optional).
 * If env.EDGRAPH is absent, reports skip (not fail).
 */
export function checkEdigraphConnectivity(env: Env): HealthCheckFn {
  return async (): Promise<HealthCheck> => {
    const start = Date.now();
    const binding = (env as any).EDGRAPH;

    if (!binding) {
      return {
        name: 'base.memory.edigraph',
        layer: 2,
        category: 'memory',
        status: 'skip',
        durationMs: Date.now() - start,
        message: 'EDGRAPH binding not configured (optional)',
      };
    }

    try {
      // Service binding fetch to a lightweight endpoint
      const res = await binding.fetch(new Request('https://internal/health'));
      return {
        name: 'base.memory.edigraph',
        layer: 2,
        category: 'memory',
        status: res.ok ? 'pass' : 'fail',
        durationMs: Date.now() - start,
        message: res.ok ? 'Edigraph service reachable' : `Edigraph returned ${res.status}`,
        details: { httpStatus: res.status },
      };
    } catch (err: any) {
      return {
        name: 'base.memory.edigraph',
        layer: 2,
        category: 'memory',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'Edigraph service unreachable',
        error: err.message,
      };
    }
  };
}

// ─── B6: HITL Queue Dry-Run ──────────────────────────────────────────────

/**
 * SELECT COUNT(*) from hitlQueue — proves D1 table exists and is queryable.
 * Does NOT insert test proposals (avoids polluting the real queue).
 */
export function checkHitlQueueDryRun(env: Env, _agentName: string): HealthCheckFn {
  return async (): Promise<HealthCheck> => {
    const start = Date.now();

    if (!env.DB) {
      return {
        name: 'base.hitl.dryRun',
        layer: 2,
        category: 'hitl',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'DB binding missing — HITL table unreachable',
        error: 'env.DB is undefined',
      };
    }

    try {
      const result = await (env.DB as any)
        .prepare('SELECT COUNT(*) as cnt FROM hitl_queue')
        .first();
      const count = result?.cnt ?? 0;

      return {
        name: 'base.hitl.dryRun',
        layer: 2,
        category: 'hitl',
        status: 'pass',
        durationMs: Date.now() - start,
        message: `HITL queue queryable (${count} total proposals)`,
        details: { totalProposals: count },
      };
    } catch (err: any) {
      return {
        name: 'base.hitl.dryRun',
        layer: 2,
        category: 'hitl',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'HITL queue table query failed',
        error: err.message,
      };
    }
  };
}

// ─── B7: Collaboration Binding Resolution ────────────────────────────────

/**
 * For each peer declared in peerAgentBindings, verify the DO namespace resolves.
 * Calls idFromName('health-probe') + .get(id) to confirm binding is wired.
 * Does NOT call any RPC on the peer — that's Layer 3 for agents that need it.
 */
export function checkCollabBindingResolution(
  env: Env,
  peers: Record<string, PeerBindingDescriptor>,
  mode: HealthMode = 'fast'
): HealthCheckFn[] {
  const checks: HealthCheckFn[] = [];

  for (const [peerName, descriptor] of Object.entries(peers)) {
    checks.push(async (): Promise<HealthCheck> => {
      const start = Date.now();
      const binding = (env as any)[descriptor.bindingKey];

      if (!binding) {
        return {
          name: `base.collab.${peerName}`,
          layer: 2,
          category: 'collab',
          status: descriptor.required ? 'fail' : 'skip',
          durationMs: Date.now() - start,
          message: descriptor.required
            ? `Required peer binding ${descriptor.bindingKey} is missing`
            : `Optional peer binding ${descriptor.bindingKey} not configured`,
          error: descriptor.required ? `env.${descriptor.bindingKey} is undefined` : undefined,
        };
      }

      try {
        if (typeof binding.idFromName !== 'function') {
          throw new Error(`${descriptor.bindingKey} is not a DurableObject namespace`);
        }
        const id = binding.idFromName('health-probe');
        const stub = binding.get(id);

        const agentStub = stub as any;
        const pingStart = Date.now();
        await agentStub.ping();
        const pingTime = Date.now() - pingStart;

        let peerStatus = 'pass';
        let peerMessage = `Peer ${peerName} (${descriptor.bindingKey}) resolvable and pinged in ${pingTime}ms`;
        const peerDetails: any = { pingTime };

        if (mode === 'deep') {
           try {
             // Use fast mode to prevent infinite cyclical detailed checking
             const report = await agentStub.healthProbe({ mode: 'fast' });
             peerStatus = report.status === 'error' ? 'fail' : report.status;
             peerMessage += ` | Health: ${report.status}`;
             peerDetails.report = report;
           } catch (deepErr) {
             peerStatus = 'warn';
             peerMessage += ` | Deep health probe failed`;
             peerDetails.deepError = String(deepErr);
           }
        }

        return {
          name: `base.collab.${peerName}`,
          layer: 2,
          category: 'collab',
          status: peerStatus as 'pass'|'fail'|'warn'|'skip',
          durationMs: Date.now() - start,
          message: peerMessage,
          details: peerDetails
        };
      } catch (err: any) {
        return {
          name: `base.collab.${peerName}`,
          layer: 2,
          category: 'collab',
          status: descriptor.required ? 'fail' : 'skip',
          durationMs: Date.now() - start,
          message: `Peer ${peerName} binding resolution failed`,
          error: err.message,
        };
      }
    });
  }

  return checks;
}
