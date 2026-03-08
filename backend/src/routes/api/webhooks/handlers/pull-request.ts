import { App } from 'octokit';
import { withCompatOctokit } from "@/services/octokit/compat";
import { appendSignature } from "@/utils/github/signature";
import * as eventTables from "@/db/schemas/github/webhooks";
import type { WebhookHandlerContext } from '../types';

export async function handlePullRequest({ c, payload, appId, privateKey, insertPayload }: WebhookHandlerContext) {
  c.executionCtx.waitUntil(
      import('@services/github/pr-ingestion').then(m => m.processPullRequestEvent(c.env, payload).catch(e => console.error('[api/webhooks] PR ingest error:', e)))
  );

  const shouldRequestReview =
    (payload.action === 'opened' || payload.action === 'synchronize' || payload.action === 'ready_for_review') &&
    appId && privateKey && payload.installation?.id;

  if (shouldRequestReview) {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          // Trigger the Honi Multi-Agent PR Review Orchestration
          const { orchestratePrReview } = await import('@/ai/agents/pr-reviewer/orchestrator');
          await orchestratePrReview(c.env, payload, appId, privateKey);
        } catch (error) {
          console.error('[api/webhooks] Honi PR Review execution failed:', error);
        }
      })()
    );
  }

  // Insert payload to DB
  await insertPayload((eventTables as any).pullRequestEvents || {} as any, payload);
}
