import { App } from 'octokit';
import { withCompatOctokit } from "@/services/octokit/compat";
import { detectPRAuthorAgent } from "../workflows/pr-agent-tagger/index";
import { appendSignature } from "@/utils/github/signature";
import { GitHubConditionals } from "@/utils/github/conditionals";
import * as eventTables from "@/db/schemas/github/webhooks";
import type { WebhookHandlerContext } from '../types';

export async function handlePullRequest({ c, payload, appId, privateKey, insertPayload }: WebhookHandlerContext) {
  c.executionCtx.waitUntil(
      import('@services/github/pr-ingestion').then(m => m.processPullRequestEvent(c.env, payload).catch(e => console.error('[api/webhooks] PR ingest error:', e)))
  );

  const shouldRequestGeminiReview =
    (payload.action === 'synchronize' || payload.action === 'ready_for_review') &&
    appId && privateKey && payload.installation?.id;

  if (shouldRequestGeminiReview) {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const app = new App({ appId: appId!, privateKey: privateKey! });
          const octokit = withCompatOctokit(await app.getInstallationOctokit(payload.installation!.id));
          const prNumber = payload.pull_request?.number;
          const owner = payload.repository?.owner?.login;
          const repo = payload.repository?.name;

          if (!prNumber || !owner || !repo) return;
          if (payload.pull_request?.draft && payload.action !== 'ready_for_review') return;

          const existingComments = await octokit.rest.issues.listComments({ owner, repo, issue_number: prNumber, per_page: 50 });
          const alreadyRequested = GitHubConditionals.hasCommentCommand(existingComments.data, '/gemini review');
          if (alreadyRequested) return;

          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body: appendSignature('/gemini review'),
          });
        } catch (err: any) {
          console.error(`[GeminiReview] Failed to request review:`, err);
        }
      })()
    );
  }

  await insertPayload(eventTables.pullRequest, {
    pr_number: payload.pull_request?.number,
    title: payload.pull_request?.title,
    state: payload.pull_request?.state,
    head_ref: payload.pull_request?.head?.ref,
    head_sha: payload.pull_request?.head?.sha,
    base_ref: payload.pull_request?.base?.ref,
    base_sha: payload.pull_request?.base?.sha,
    merged: payload.pull_request?.merged,
    merged_at: payload.pull_request?.merged_at,
    author_login: payload.pull_request?.user?.login,
    assignee_login: payload.pull_request?.assignee?.login,
  });
}
