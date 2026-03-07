import { App } from 'octokit';
import { withCompatOctokit } from "@/services/octokit/compat";
import { appendSignature } from "@/utils/github/signature";
import {
  fetchBuildLogs,
  inferWorkerName,
  analyzeBuildFailure,
  formatBuildFailureComment,
} from "../workflows/build-analyzer";
import { detectPRAuthorAgent } from "../workflows/pr-agent-tagger";
import * as eventTables from "@/db/schemas/github/webhooks";
import type { WebhookHandlerContext } from '../types';

export async function handleCheckRun({ c, payload, appId, privateKey, insertPayload }: WebhookHandlerContext) {
  if (payload.action === 'completed' && payload.check_run?.conclusion === 'failure') {
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const checkRun = payload.check_run;
          const prList = checkRun?.pull_requests || [];
          if (prList.length === 0 || !payload.repository || !payload.installation?.id) return;

          const checkName = (checkRun?.name || '').toLowerCase();
          const appName = (checkRun?.app?.name || '').toLowerCase();
          const isCloudflareCheck =
            checkName.includes('cloudflare') ||
            checkName.includes('deploy') ||
            checkName.includes('wrangler') ||
            appName.includes('cloudflare') ||
            appName.includes('workers');

          if (!isCloudflareCheck) return;

          const prNumber = prList[0]?.number;
          if (!prNumber) return;

          const app = new App({ appId: appId!, privateKey: privateKey! });
          const octokit = withCompatOctokit(await app.getInstallationOctokit(payload.installation.id));

          const prRes = await octokit.rest.pulls.get({
            owner: payload.repository.owner?.login,
            repo: payload.repository.name,
            pull_number: prNumber,
          });

          const issueCommentsRes = await octokit.rest.issues.listComments({
            owner: payload.repository.owner?.login,
            repo: payload.repository.name,
            issue_number: prNumber,
            per_page: 100,
          });

          const agentInfo = detectPRAuthorAgent({
            headRef: prRes.data.head?.ref,
            body: prRes.data.body,
            authorLogin: prRes.data.user?.login,
            authorHtmlUrl: prRes.data.user?.html_url,
            issueComments: issueCommentsRes.data.map((c: any) => ({ body: c.body || "" })),
          });

          if (!agentInfo) return;

          const workerName = inferWorkerName(payload.repository.full_name || payload.repository.name);
          const logs = await fetchBuildLogs(c.env, workerName);
          if (!logs) return;

          const analysis = await analyzeBuildFailure(c.env, logs, {
            prNumber,
            prTitle: prRes.data.title,
            headRef: prRes.data.head?.ref || '',
            repoFullName: payload.repository.full_name || `${payload.repository.owner?.login}/${payload.repository.name}`,
          });

          const commentBody = appendSignature(formatBuildFailureComment(agentInfo.tag, prNumber, analysis));
          await octokit.rest.issues.createComment({
            owner: payload.repository.owner?.login,
            repo: payload.repository.name,
            issue_number: prNumber,
            body: commentBody,
          });
        } catch (error: any) {
          console.error('[BuildAnalyzer] Failed to analyze build failure:', error);
        }
      })()
    );
  }

  await insertPayload(eventTables.checkRun, {
    check_run_id: payload.check_run?.id,
    head_sha: payload.check_run?.head_sha,
    status: payload.check_run?.status,
    conclusion: payload.check_run?.conclusion,
    started_at: payload.check_run?.started_at,
    completed_at: payload.check_run?.completed_at,
    app_id: payload.check_run?.app?.id,
  });
}
