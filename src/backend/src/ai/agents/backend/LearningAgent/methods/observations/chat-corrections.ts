/**
 * @file LearningAgent/methods/observeChatCorrection.ts
 * @description Ingests repeated user corrections from peer agents.
 *
 * When another agent (e.g., OrchestratorAgent) detects the user is repeating
 * the same instruction (e.g., "use global Env via worker-configuration.d.ts"),
 * it calls this method via getPeerAgent('LEARNING_AGENT').observeChatCorrection().
 *
 * Observations are stored in `fleet_observations` with `source = 'chat-correction'`.
 * When `recurrenceCount` crosses a configurable threshold (default 3, tunable via
 * D1 agent config), the observation auto-promotes into the HITL queue with
 * `proposal_target = 'template-repo'`.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@db';
import { fleetObservations } from '@db/schemas/agents/fleet-observations';
import { HitlQueue } from '@/ai/providers/agent-support/hitl-queue';
import type { LearningAgent } from '../../index';
import type { ChatCorrectionInput, ProposalTarget } from '../../types';

/** Compute a pattern hash for recurrence detection. */
async function computePatternHash(workerName: string, failureType: string, message: string): Promise<string> {
  const normalized = `${workerName}:${failureType}:${message.toLowerCase().trim().replace(/\s+/g, ' ')}`;
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function observeChatCorrection(
  agent: LearningAgent,
  input: ChatCorrectionInput,
): Promise<{ observationId: string; recurrenceCount: number; promoted: boolean }> {
  const env = agent.getEnv();
  const logger = agent.getLogger();
  const db = getDb(env.DB);

  const patternHash = await computePatternHash(
    input.target.workerName,
    'pattern',
    input.correctionMessage,
  );

  // Check for existing observation with same pattern_hash
  const existing = await db
    .select()
    .from(fleetObservations)
    .where(eq(fleetObservations.patternHash, patternHash))
    .limit(1);

  const now = new Date().toISOString();
  let observationId: string;
  let recurrenceCount: number;

  if (existing.length > 0) {
    // Increment recurrence
    observationId = existing[0].id;
    recurrenceCount = existing[0].recurrenceCount + 1;
    await db
      .update(fleetObservations)
      .set({
        recurrenceCount,
        updatedAt: now,
        contextMetadata: {
          ...(existing[0].contextMetadata as Record<string, unknown> ?? {}),
          chatThreadId: input.chatThreadId,
          sourceAgent: input.sourceAgent,
          lastOccurrence: now,
        },
      })
      .where(eq(fleetObservations.id, observationId));
  } else {
    // Create new observation
    observationId = crypto.randomUUID();
    recurrenceCount = 1;
    await db.insert(fleetObservations).values({
      id: observationId,
      workerName: input.target.workerName,
      accountId: input.target.accountId ?? null,
      repoOwner: input.target.repoOwner ?? null,
      repoName: input.target.repoName ?? null,
      source: 'chat-correction',
      failureType: 'pattern',
      failureMessage: input.correctionMessage,
      patternHash,
      recurrenceCount: 1,
      contextMetadata: {
        chatThreadId: input.chatThreadId,
        sourceAgent: input.sourceAgent,
      },
      hitlPromoted: 0,
      hitlRecordId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  logger.info('[observeChatCorrection] Recorded observation', {
    observationId,
    workerName: input.target.workerName,
    recurrenceCount,
    patternHash: patternHash.substring(0, 12),
  });

  // ── Auto-promotion threshold ─────────────────────────────────────────
  // Configurable via D1 agent config, falls back to 3
  let threshold = 3;
  try {
    const ai = agent.getAI();
    const cfg = await ai.getAgentFunctionConfig('LearningAgent', 'auto_promote_threshold');
    // Config row uses `notes` field for non-provider/model overrides
    if (cfg?.notes) {
      const parsed = Number(cfg.notes);
      if (!isNaN(parsed) && parsed > 0) threshold = parsed;
    }
  } catch {
    // Use default threshold
  }

  // Check if already promoted
  const currentObs = existing.length > 0
    ? (await db.select().from(fleetObservations).where(eq(fleetObservations.id, observationId)).limit(1))[0]
    : null;
  const alreadyPromoted = currentObs?.hitlPromoted === 1 || (existing.length === 0 ? false : existing[0].hitlPromoted === 1);

  if (recurrenceCount >= threshold && !alreadyPromoted) {
    const hitl = new HitlQueue(env);
    const hitlRecordId = await hitl.propose({
      workflowId: `fleet-correction-${observationId}`,
      category: 'fleet_chat_correction',
      entityId: observationId,
      proposedPayload: {
        correctionMessage: input.correctionMessage,
        workerName: input.target.workerName,
        repoOwner: input.target.repoOwner,
        repoName: input.target.repoName,
        recurrenceCount,
      },
      contextMetadata: {
        chatThreadId: input.chatThreadId,
        sourceAgent: input.sourceAgent,
        autoPromoted: true,
        threshold,
      },
      proposalTarget: 'template-repo' as ProposalTarget,
      targetWorkerName: input.target.workerName,
      targetRepoFullName: input.target.repoOwner && input.target.repoName
        ? `${input.target.repoOwner}/${input.target.repoName}`
        : undefined,
    });

    await db
      .update(fleetObservations)
      .set({ hitlPromoted: 1, hitlRecordId, updatedAt: now })
      .where(eq(fleetObservations.id, observationId));

    logger.info('[observeChatCorrection] Auto-promoted to HITL queue', {
      observationId,
      hitlRecordId,
      recurrenceCount,
      threshold,
    });

    return { observationId, recurrenceCount, promoted: true };
  }

  return { observationId, recurrenceCount, promoted: false };
}
