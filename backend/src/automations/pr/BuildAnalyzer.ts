import { BaseAutomation } from '@/core/BaseAutomation';
import { withCompatOctokit } from "@/services/octokit/compat";
import { appendSignature } from "@/utils/github/signature";
import {
  fetchBuildLogs,
  inferWorkerName,
  analyzeBuildFailure,
  formatBuildFailureComment,
} from "@/routes/api/webhooks/workflows/build-analyzer";
import { detectPRAuthorAgent } from "@/routes/api/webhooks/workflows/pr-agent-tagger";

type CheckRunPayload = {
  action?: string;
  check_run?: {
    conclusion?: string | null;
    name?: string;
    app?: { name?: string };
    pull_requests?: Array<{ number?: number }>;
  };
  repository?: {
    owner?: { login?: string };
    name?: string;
    full_name?: string;
  };
};

export class BuildAnalyzer extends BaseAutomation<CheckRunPayload> {
  async shouldExecute(): Promise<boolean> {
    if (this.payload.action !== 'completed' || this.payload.check_run?.conclusion !== 'failure') return false;

    const checkRun = this.payload.check_run;
    const prList = checkRun?.pull_requests || [];
    if (prList.length === 0 || !this.payload.repository) return false;

    const checkName = (checkRun?.name || '').toLowerCase();
    const appName = (checkRun?.app?.name || '').toLowerCase();
    return checkName.includes('cloudflare') ||
           checkName.includes('deploy') ||
           checkName.includes('wrangler') ||
           appName.includes('cloudflare') ||
           appName.includes('workers');
  }

  async execute(): Promise<void> {
    try {
      const checkRun = this.payload.check_run;
      const repository = this.payload.repository;
      const prList = checkRun?.pull_requests;
      const prNumber = prList?.[0]?.number;
      const repoOwner = repository?.owner?.login;
      const repoName = repository?.name;
      const repoFullName = repository?.full_name;
      if (!checkRun || !prList || !prNumber || !repoOwner || !repoName) return;

      const octokit = withCompatOctokit(await this.getGitHubClient());

      const prRes = await octokit.rest.pulls.get({
        owner: repoOwner,
        repo: repoName,
        pull_number: prNumber,
      });

      const issueCommentsRes = await octokit.rest.issues.listComments({
        owner: repoOwner,
        repo: repoName,
        issue_number: prNumber,
        per_page: 100,
      });

      const agentInfo = detectPRAuthorAgent({
        headRef: prRes.data.head?.ref,
        body: prRes.data.body,
        authorLogin: prRes.data.user?.login,
        authorHtmlUrl: prRes.data.user?.html_url,
        issueComments: issueCommentsRes.data.map((c: Record<string, unknown>) => ({ body: (c.body as string) || "" })),
      });

      if (!agentInfo) return;

      const workerName = inferWorkerName(repoFullName || repoName);
      const logs = await fetchBuildLogs(this.env, workerName);
      if (!logs) return;

      const analysis = await analyzeBuildFailure(this.env, logs, {
        prNumber,
        prTitle: prRes.data.title,
        headRef: prRes.data.head?.ref || '',
        repoFullName: repoFullName || `${repoOwner}/${repoName}`,
      });

      const commentBody = appendSignature(formatBuildFailureComment(agentInfo.tag, prNumber, analysis));
      await octokit.rest.issues.createComment({
        owner: repoOwner,
        repo: repoName,
        issue_number: prNumber,
        body: commentBody,
      });
      await this.logExecution('success', 'Analyzed build failure and posted comment', prNumber);
    } catch (error: unknown) {
      console.error('[BuildAnalyzer] Failed to analyze build failure:', error);
      await this.logExecution('failure', `BuildAnalyzer failed: ${this.getErrorMessage(error)}`);
    }
  }
}
