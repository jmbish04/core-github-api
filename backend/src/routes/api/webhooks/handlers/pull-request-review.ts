import { App } from 'octokit';
import { withCompatOctokit } from "@/services/octokit/compat";
import { appendSignature } from "@/utils/github/signature";
import * as eventTables from "@/db/schemas/github/webhooks";
import type { WebhookHandlerContext } from '../types';
import {
  isCodeReviewBot,
  formatAgentFixComment,
  detectPRAuthorAgent,
  type ExtractedReviewComment,
} from "../workflows/pr-agent-tagger";

export async function handlePullRequestReview({ c, payload, eventName, appId, privateKey, insertPayload }: WebhookHandlerContext) {
  if (eventName === 'pull_request_review_comment') {
      c.executionCtx.waitUntil(
          import('@services/github/pr-ingestion').then(m => m.processCodeReviewComment(c.env, payload).catch(e => console.error('[api/webhooks] PR review ingest error:', e)))
      );
      return; 
      // Handled code review comment insertion separately?
      // Wait, we should probably insert it into DB either way or handled elsewhere. Assumed old code didn't insert into DB for 'pull_request_review_comment' except through pr-ingestion.
  }

  if (payload.action === 'submitted' && payload.review?.user?.login) {
    const reviewerLogin = payload.review.user.login;
    if (isCodeReviewBot(reviewerLogin)) {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const prData = payload.pull_request;
            if (!prData || !payload.repository || !payload.installation?.id) return;

            const app = new App({ appId: appId!, privateKey: privateKey! });
            const octokit = withCompatOctokit(await app.getInstallationOctokit(payload.installation.id));

            const issueCommentsRes = await octokit.rest.issues.listComments({
              owner: payload.repository.owner?.login,
              repo: payload.repository.name,
              issue_number: prData.number,
              per_page: 100,
            });

            const agentInfo = detectPRAuthorAgent({
              headRef: prData.head?.ref,
              body: prData.body,
              authorLogin: prData.user?.login,
              authorHtmlUrl: prData.user?.html_url,
              issueComments: issueCommentsRes.data.map((c: any) => ({ body: c.body || "" })),
            });

            if (!agentInfo) return;

            const reviewCommentsRes = await octokit.rest.pulls.listReviewComments({
              owner: payload.repository.owner?.login,
              repo: payload.repository.name,
              pull_number: prData.number,
              per_page: 100,
            });

            const botComments: ExtractedReviewComment[] = reviewCommentsRes.data
              .filter((c: any) => c.user?.login === reviewerLogin)
              .map((c: any) => ({
                path: c.path || '',
                line: c.line || c.original_line || null,
                body: c.body || '',
                diff_hunk: c.diff_hunk,
                suggestion: c.body?.match(/```suggestion\n([\s\S]*?)\n```/)?.[1] || undefined,
              }));

            if (botComments.length === 0) return;

            const commentBody = appendSignature(formatAgentFixComment(agentInfo.tag, prData.number, botComments));
            await octokit.rest.issues.createComment({
              owner: payload.repository.owner?.login,
              repo: payload.repository.name,
              issue_number: prData.number,
              body: commentBody,
            });
          } catch (error: any) {
            console.error('[AgentTagger] Failed to process review:', error);
          }
        })()
      );
    }
  }

  if (payload.action === 'submitted' && payload.review?.state !== 'approved') {
      const origin = new URL(c.req.url).origin;
      c.executionCtx.waitUntil(
          import('@services/github/pr-ingestion').then(m => 
              m.extractReviewCommentsAndPostReply(
                  c.env, 
                  payload.repository!.owner.login, 
                  payload.repository!.name, 
                  payload.pull_request!.number, 
                  origin
              ).catch(e => console.error('[api/webhooks] Automatic comment extraction error:', e))
          )
      );
  }

  await insertPayload(eventTables.pullRequestReview, {
    review_id: payload.review?.id,
    pr_number: payload.pull_request?.number,
    state: payload.review?.state,
    author_login: payload.review?.user?.login,
    submitted_at: payload.review?.submitted_at,
    body: payload.review?.body,
  });
}
