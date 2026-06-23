/**
 * @file ai/providers/agent-support/health/chat-checks.ts
 * @description Layer 2 health check factories for BaseChatAgent.
 *
 * Extends base checks with chat-specific diagnostics:
 *   C1: AIChatAgent internals (messages array, saveMessages, broadcast)
 *   C2: Stream shape sanity (no tokens — uses AbortSignal.timeout(0))
 *   C3: Workers AI chat round-trip (DEEP MODE ONLY — real inference)
 */

import type { HealthCheck, HealthCheckFn, HealthMode } from './types';

// ─── C1: AIChatAgent Internals ───────────────────────────────────────────

/**
 * Verify AIChatAgent-specific methods and state are initialized.
 * Checks: messages array, saveMessages function, broadcast function.
 */
export function checkAIChatAgentInternals(agent: any): HealthCheckFn {
  return async (): Promise<HealthCheck> => {
    const start = Date.now();
    const issues: string[] = [];

    // Check messages initialization
    if (!Array.isArray(agent.messages)) {
      issues.push('messages is not an Array');
    }

    // Check saveMessages is a function
    if (typeof agent.saveMessages !== 'function') {
      issues.push('saveMessages is not a function');
    }

    // Check broadcast is a function (WebSocket fan-out)
    if (typeof agent.broadcast !== 'function') {
      issues.push('broadcast is not a function');
    }

    return {
      name: 'chat.internals.aiChatAgent',
      layer: 2,
      category: 'chat',
      status: issues.length === 0 ? 'pass' : 'fail',
      durationMs: Date.now() - start,
      message: issues.length === 0
        ? 'AIChatAgent internals initialized (messages, saveMessages, broadcast)'
        : `AIChatAgent issues: ${issues.join(', ')}`,
      error: issues.length > 0 ? issues.join('; ') : undefined,
      details: {
        messagesIsArray: Array.isArray(agent.messages),
        hasSaveMessages: typeof agent.saveMessages === 'function',
        hasBroadcast: typeof agent.broadcast === 'function',
      },
    };
  };
}

// ─── C2: Stream Shape Sanity ─────────────────────────────────────────────

/**
 * Verify that the streamText → toUIMessageStreamResponse pipeline shape is intact.
 * Uses no tokens: we only check that the required functions exist on the agent.
 *
 * This runs in FAST mode — no inference call is made.
 */
export function checkStreamShapeSanity(agent: any): HealthCheckFn {
  return async (): Promise<HealthCheck> => {
    const start = Date.now();
    const details: Record<string, unknown> = {};

    try {
      // Check that the agent has the chat method pipeline available
      const hasOnChatMessage = typeof agent.onChatMessage === 'function';
      details.hasOnChatMessage = hasOnChatMessage;

      // Check resolveSystemPrompt exists (BaseChatAgent method)
      const hasResolveSystemPrompt = typeof agent.resolveSystemPrompt === 'function';
      details.hasResolveSystemPrompt = hasResolveSystemPrompt;

      // Check verifyChatFormat exists
      const hasVerifyChatFormat = typeof agent.verifyChatFormat === 'function';
      details.hasVerifyChatFormat = hasVerifyChatFormat;

      const allPresent = hasOnChatMessage && hasResolveSystemPrompt;

      return {
        name: 'chat.stream.shapeSanity',
        layer: 2,
        category: 'chat',
        status: allPresent ? 'pass' : 'fail',
        durationMs: Date.now() - start,
        message: allPresent
          ? 'Chat pipeline shape intact (onChatMessage, resolveSystemPrompt)'
          : 'Chat pipeline missing required methods',
        details,
      };
    } catch (err: any) {
      return {
        name: 'chat.stream.shapeSanity',
        layer: 2,
        category: 'chat',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'Stream shape check threw',
        error: err.message,
        details,
      };
    }
  };
}

// ─── C3: Workers AI Chat Round-Trip (DEEP ONLY) ─────────────────────────

/**
 * Perform a REAL Workers AI inference round-trip.
 *
 * ⚠️  DEEP MODE ONLY — this consumes tokens and should NEVER run on cron.
 *
 * Sends a minimal prompt to @cf/meta/llama-3.3-70b-instruct-fp8-fast,
 * reads the response, verifies non-empty text, and reports timing.
 */
export function checkWorkersAIChatRoundTrip(env: Env): HealthCheckFn {
  return async (): Promise<HealthCheck> => {
    const start = Date.now();

    try {
      const ai = (env as any).AI;
      if (!ai) {
        return {
          name: 'chat.model.workersAiRoundTrip',
          layer: 2,
          category: 'model',
          status: 'fail',
          durationMs: Date.now() - start,
          message: 'AI binding missing — cannot run model probe',
          error: 'env.AI is undefined',
        };
      }

      // Minimal prompt — cheap, fast, deterministic
      const result = await ai.run(
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        {
          messages: [
            { role: 'user', content: 'Reply with exactly: HEALTH_OK' },
          ],
          max_tokens: 10,
        },
        { gateway: { id: 'core-github-api' } }
      );

      const responseText = result?.response ?? '';
      const roundTripMs = Date.now() - start;

      return {
        name: 'chat.model.workersAiRoundTrip',
        layer: 2,
        category: 'model',
        status: responseText.length > 0 ? 'pass' : 'fail',
        durationMs: roundTripMs,
        message: responseText.length > 0
          ? `Workers AI responded in ${roundTripMs}ms`
          : 'Workers AI returned empty response',
        details: {
          model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
          responseLength: responseText.length,
          roundTripMs,
        },
      };
    } catch (err: any) {
      return {
        name: 'chat.model.workersAiRoundTrip',
        layer: 2,
        category: 'model',
        status: 'fail',
        durationMs: Date.now() - start,
        message: 'Workers AI round-trip failed',
        error: err.message,
      };
    }
  };
}

// ─── Helper: Get chat checks for a given mode ────────────────────────────

/**
 * Returns the appropriate set of chat check factories based on mode.
 * Fast mode: C1 + C2 only (zero tokens)
 * Deep mode: C1 + C2 + C3 (real inference)
 */
export function getChatChecks(agent: any, env: Env, mode: HealthMode): HealthCheckFn[] {
  const checks: HealthCheckFn[] = [
    checkAIChatAgentInternals(agent),
    checkStreamShapeSanity(agent),
  ];

  if (mode === 'deep') {
    checks.push(checkWorkersAIChatRoundTrip(env));
  }

  return checks;
}
