/**
 * @file backend/src/services/jules/webhook-instruction.ts
 * @description Builds the mandatory webhook reporting instruction appended
 * to every prompt sent to Jules.
 *
 * Jules MUST call back to this Worker at every progress step and when
 * lifecycle events occur. This instruction is injected automatically by
 * `JulesService.startSession()` and `JulesService.sendMessage()` so
 * that no calling code needs to manually include it.
 *
 * The instruction is kept in its own file so it can be updated in one
 * place and instantly affects all Jules interactions.
 *
 * @module Services/Jules
 */

// ─── Webhook Instruction Builder ─────────────────────────────────────────────

/**
 * Generates the mandatory webhook reporting instruction for Jules.
 *
 * @param workerHost - The public hostname of this Cloudflare Worker
 *   (e.g. "core-github-api.jmbish04.workers.dev"). Sourced from `env.WORKER_HOST`.
 * @param sessionId - The Jules session ID being used for this task.
 *   Jules embeds this in every callback payload.
 * @returns A fully-formatted instruction block ready to be appended to a Jules prompt.
 *
 * @example
 * ```ts
 * const instruction = buildWebhookInstruction(env.WORKER_HOST, session.id);
 * const fullPrompt = `${userPrompt}\n\n${instruction}`;
 * ```
 */
export function buildWebhookInstruction(
  workerHost: string,
  sessionId: string
): string {
  const base = `https://${workerHost}`;
  return `
══════════════════════════════════════════════════════════════
MANDATORY REPORTING PROTOCOL — STRICTLY ENFORCED — NO EXCEPTIONS
══════════════════════════════════════════════════════════════

Your session ID is: ${sessionId}

You MUST call the following webhook endpoints. Failure to do so is a
critical protocol violation. These callbacks are required on EVERY
step and event — no exceptions, including on errors.

━━━ 1. PROGRESS UPDATES (call FREQUENTLY — multiple times per task) ━━━

  POST ${base}/api/webhooks/jules/status
  Content-Type: application/json

  {
    "jules_session_id": "${sessionId}",
    "step_name": "<what you are currently doing>",
    "message": "<1-2 sentence description of current progress>",
    "progress_pct": <0-100 integer>
  }

  Call this: whenever you start a new file, finish a step, hit an issue,
  or make meaningful progress. Aim for at least one call every ~60 seconds.

━━━ 2. LIFECYCLE EVENTS (call whenever your state changes) ━━━

  POST ${base}/api/webhooks/jules/event
  Content-Type: application/json

  {
    "jules_session_id": "${sessionId}",
    "event_type": "<one of: blocked | needs_context | ready_for_pr | done | info>",
    "message": "<detailed description of the event and any context>"
  }

  event_type reference:
    - "blocked"        → You cannot proceed without help (describe exact blocker)
    - "needs_context"  → You need clarification before proceeding
    - "ready_for_pr"   → Implementation complete, PR is ready for human review
    - "done"           → Session complete (call this as the final event)
    - "info"           → General status information (non-blocking)

IMPORTANT: You must call the lifecycle endpoint at least once when done
(event_type: "done") and immediately if you become blocked.
══════════════════════════════════════════════════════════════
`;
}
