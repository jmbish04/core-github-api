/**
 * @file ResearchAgent/methods/hitl/index.ts
 * @description HITL proposal pipeline for the ResearchAgent.
 *
 * Responsibilities:
 *   - Evaluate tracked_items for actionability (AI-driven)
 *   - Propose actionable items to the HITL queue targeting:
 *     standardization repo, GoldenPaths, GuardrailAgent rules, or agent skills
 *   - Fan out deliberation requests to peer agents
 *     (LearningAgent, CloudflareAgent, GuardrailAgent)
 *   - Append deliberation opinions to the HITL record context
 */

import { getDb, schema } from '@db';
import { eq } from 'drizzle-orm';
import { HitlQueue } from '@/ai/providers/agent-support/hitl-queue';
import type { ResearchAgent } from '../../index';
import type { TrackedItemRow, TrackedSourceRow } from '@db/schemas/agents/research-tracking';
import { hitlQueue } from '@/db/schemas/workflows/hitl';

// ---------------------------------------------------------------------------
// Proposal target types (mirrors hitl_queue.proposal_target)
// ---------------------------------------------------------------------------

export type ResearchProposalTarget =
  | 'template-repo'
  | 'guardrail-rules'
  | 'core-github-api'
  | 'worker-specific';

// ---------------------------------------------------------------------------
// Evaluate new tracked_items and propose actionable ones to HITL
// ---------------------------------------------------------------------------

export async function evaluateAndProposeItems(
  agent: ResearchAgent,
  items: TrackedItemRow[],
  source: TrackedSourceRow,
): Promise<number> {
  const logger = (agent as any).logger;
  let proposed = 0;

  for (const item of items) {
    try {
      const evaluation = await evaluateActionability(agent, item, source);
      if (!evaluation.isActionable) continue;

      await proposeToHitl(agent, item, {
        proposalTarget: evaluation.target,
        reasoning: evaluation.reasoning,
        suggestedImplementation: evaluation.suggestedImplementation,
      });
      proposed++;
    } catch (err: any) {
      logger.warn(`[hitl] Failed to evaluate/propose item "${item.title}": ${err.message}`);
    }
  }

  if (proposed > 0) {
    logger.info(`[hitl] Proposed ${proposed}/${items.length} items to HITL queue`);
  }

  return proposed;
}

// ---------------------------------------------------------------------------
// AI evaluation: is this tracked item actionable?
// ---------------------------------------------------------------------------

interface ActionabilityResult {
  isActionable: boolean;
  target: ResearchProposalTarget;
  reasoning: string;
  suggestedImplementation: string;
}

async function evaluateActionability(
  agent: ResearchAgent,
  item: TrackedItemRow,
  source: TrackedSourceRow,
): Promise<ActionabilityResult> {
  const systemPrompt = `You are a senior platform architect reviewing a newly discovered technical update.
Determine if this discovery is actionable for our engineering ecosystem:
- "template-repo": Should update our seed/standardization template repository
- "guardrail-rules": Should add/modify golden path enforcement rules
- "core-github-api": Should update our main platform worker
- null: Not actionable — informational only

Respond in JSON: { "isActionable": boolean, "target": string|null, "reasoning": string, "suggestedImplementation": string }`;

  const userPrompt = `Source: ${source.name} (${source.type})
Title: ${item.title}
URL: ${item.url}
Content: ${(item.content ?? '').slice(0, 2000)}
AI Summary: ${item.aiSummary ?? 'N/A'}`;

  try {
    const response = await (agent as any).ai.generateText(
      userPrompt,
      systemPrompt,
      { provider: 'workers-ai', model: '@cf/meta/llama-4-scout-17b-16e-instruct' },
    );

    const parsed = JSON.parse(response);
    return {
      isActionable: !!parsed.isActionable,
      target: parsed.target ?? 'template-repo',
      reasoning: parsed.reasoning ?? '',
      suggestedImplementation: parsed.suggestedImplementation ?? '',
    };
  } catch {
    return { isActionable: false, target: 'template-repo', reasoning: 'AI evaluation failed', suggestedImplementation: '' };
  }
}

// ---------------------------------------------------------------------------
// Propose a single tracked item to HITL queue
// ---------------------------------------------------------------------------

export async function proposeToHitl(
  agent: ResearchAgent,
  item: TrackedItemRow,
  context: {
    proposalTarget: ResearchProposalTarget;
    reasoning: string;
    suggestedImplementation: string;
  },
): Promise<{ hitlRecordId: string }> {
  const env = (agent as any).env;
  const db = getDb(env.DB);
  const hitl = new HitlQueue(env);

  const hitlRecordId = await hitl.propose({
    workflowId: `research-proposal-${item.id}`,
    category: 'research_proposal',
    entityId: item.id,
    proposedPayload: {
      title: item.title,
      url: item.url,
      aiSummary: item.aiSummary,
      reasoning: context.reasoning,
      suggestedImplementation: context.suggestedImplementation,
      sourceId: item.sourceId,
    },
    contextMetadata: {
      sourceId: item.sourceId,
      publishedAt: item.publishedAt,
      deliberation: [], // Will be populated by requestDeliberation()
    },
    proposalTarget: context.proposalTarget,
  });

  // Mark the tracked item as HITL-queued
  await db
    .update(schema.trackedItems)
    .set({ hitlQueued: true, hitlRecordId })
    .where(eq(schema.trackedItems.id, item.id));

  (agent as any).logger.info(`[hitl] Proposed "${item.title}" → HITL (${context.proposalTarget})`, { hitlRecordId });

  return { hitlRecordId };
}

// ---------------------------------------------------------------------------
// Multi-agent deliberation: fan out to peer agents for opinions
// ---------------------------------------------------------------------------

export interface DeliberationEntry {
  agent: string;
  opinion: string;
  timestamp: string;
}

export async function requestDeliberation(
  agent: ResearchAgent,
  hitlRecordId: string,
): Promise<{ deliberation: DeliberationEntry[] }> {
  const logger = (agent as any).logger;
  const env = (agent as any).env;
  const db = getDb(env.DB);

  // Fetch the HITL record
  const hitl = new HitlQueue(env);
  const record = await hitl.get(hitlRecordId);
  if (!record) throw new Error(`HITL record not found: ${hitlRecordId}`);

  const payload = record.proposedPayload as any;
  const deliberationPrompt = `
A research discovery has been proposed for review:
Title: ${payload.title}
URL: ${payload.url}
AI Summary: ${payload.aiSummary ?? 'N/A'}
Reasoning: ${payload.reasoning}
Suggested Implementation: ${payload.suggestedImplementation}
Proposal Target: ${record.proposalTarget ?? 'template-repo'}

Please provide your expert opinion on whether this proposal is valid,
any concerns, and how it should be implemented. Be concise (2-3 sentences).`;

  const deliberation: DeliberationEntry[] = [];
  const now = () => new Date().toISOString();

  // 1. ResearchAgent's own context (self)
  deliberation.push({
    agent: 'ResearchAgent',
    opinion: `Original proposal. Source material at ${payload.url}. ${payload.reasoning}`,
    timestamp: now(),
  });

  // 2. LearningAgent — pattern correlation
  try {
    const learningAgent = (agent as any).getPeerAgent(env.LEARNING_AGENT);
    if (learningAgent) {
      const response = await learningAgent.deepReason?.(deliberationPrompt) ??
        { output: 'LearningAgent did not respond' };
      deliberation.push({
        agent: 'LearningAgent',
        opinion: typeof response === 'string' ? response : (response.output ?? JSON.stringify(response)),
        timestamp: now(),
      });
    }
  } catch (err: any) {
    logger.warn(`[deliberation] LearningAgent failed: ${err.message}`);
    deliberation.push({ agent: 'LearningAgent', opinion: `Error: ${err.message}`, timestamp: now() });
  }

  // 3. CloudflareAgent — docs MCP lookup
  try {
    const cfAgent = (agent as any).getPeerAgent(env.CLOUDFLARE_AGENT);
    if (cfAgent) {
      const response = await cfAgent.chat?.(deliberationPrompt) ??
        { output: 'CloudflareAgent did not respond' };
      deliberation.push({
        agent: 'CloudflareAgent',
        opinion: typeof response === 'string' ? response : (response.output ?? JSON.stringify(response)),
        timestamp: now(),
      });
    }
  } catch (err: any) {
    logger.warn(`[deliberation] CloudflareAgent failed: ${err.message}`);
    deliberation.push({ agent: 'CloudflareAgent', opinion: `Error: ${err.message}`, timestamp: now() });
  }

  // 4. GuardrailAgent — conflict/duplicate check
  try {
    const guardrailAgent = (agent as any).getPeerAgent(env.GUARDRAIL_AGENT);
    if (guardrailAgent) {
      const response = await guardrailAgent.evaluatePayload?.({
        requestId: `deliberation-${hitlRecordId}`,
        code: payload.suggestedImplementation ?? '',
        context: 'research_proposal_review',
      });
      deliberation.push({
        agent: 'GuardrailAgent',
        opinion: response?.issues?.length
          ? `Potential conflicts: ${response.issues.map((i: any) => i.message).join('; ')}`
          : `No conflicts detected. Score: ${response?.score ?? 'N/A'}/100`,
        timestamp: now(),
      });
    }
  } catch (err: any) {
    logger.warn(`[deliberation] GuardrailAgent failed: ${err.message}`);
    deliberation.push({ agent: 'GuardrailAgent', opinion: `Error: ${err.message}`, timestamp: now() });
  }

  // Update the HITL record with deliberation results
  const currentMetadata = (record.contextMetadata as any) ?? {};
  await db
    .update(hitlQueue)
    .set({
      contextMetadata: { ...currentMetadata, deliberation },
      updatedAt: now(),
    })
    .where(eq(hitlQueue.id, hitlRecordId));

  logger.info(`[deliberation] Completed for HITL ${hitlRecordId}: ${deliberation.length} opinions`);

  return { deliberation };
}
