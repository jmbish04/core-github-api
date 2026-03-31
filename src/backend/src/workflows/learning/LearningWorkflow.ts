/**
 * @file backend/src/workflows/learning/LearningWorkflow.ts
 * @description Cloudflare Workflow that processes unprocessed learning messages,
 * runs pattern detection, and records insights in D1.
 *
 * Triggered by:
 *   - Cron (daily at 6 AM UTC)
 *   - Manual trigger via POST /api/learning/sync
 *
 * @module Workflows/Learning
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { getDb } from '@db';
import { learningSessions, learningMessages } from '@db/schemas/github/learning';
import { eq } from 'drizzle-orm';

interface WorkflowParams {
  triggerType: 'cron' | 'manual';
  batchSize?: number;
}

export class LearningWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    const { triggerType, batchSize = 50 } = event.payload;
    const db = getDb(this.env.DB);

    // Step 1: Create a new learning session
    const sessionId = await step.do('create-session', async () => {
      const id = crypto.randomUUID();
      await db.insert(learningSessions).values({
        id,
        triggerType,
        status: 'running',
        repoless: false,
        startedAt: new Date(),
        createdAt: new Date(),
      });
      return id;
    });

    // Step 2: Fetch unprocessed messages
    const messages = await step.do('fetch-unprocessed', async () => {
      return db.select().from(learningMessages)
        .where(eq(learningMessages.processed, false))
        .limit(batchSize);
    });

    // Step 3: Run pattern detection via LearningAgent DO
    const insightCount = await step.do('detect-patterns', async () => {
      if (messages.length === 0) return 0;

      const agentId = (this.env as any).LEARNING_AGENT.idFromName('learning-agent');
      const agent = (this.env as any).LEARNING_AGENT.get(agentId);
      const res = await agent.fetch('http://internal/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (!res.ok) return 0;
      const data = await res.json() as any;
      return data.insights?.length ?? 0;
    });

    // Step 4: Finalize the session
    await step.do('finalize-session', async () => {
      await db.update(learningSessions)
        .set({
          status: 'completed',
          insightCount,
          completedAt: new Date(),
        })
        .where(eq(learningSessions.id, sessionId));
    });

    return { sessionId, insightCount };
  }
}
