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

export class BuildAnalyzer extends BaseAutomation {
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
      const prList = this.payload.check_run.pull_requests;
      const prNumber = prList[0]?.number;
      if (!prNumber) return;

      const octokit = withCompatOctokit(await this.getGitHubClient());

      const prRes = await octokit.rest.pulls.get({
        owner: this.payload.repository.owner?.login,
        repo: this.payload.repository.name,
        pull_number: prNumber,
      });

      const issueCommentsRes = await octokit.rest.issues.listComments({
        owner: this.payload.repository.owner?.login,
        repo: this.payload.repository.name,
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

      const workerName = inferWorkerName(this.payload.repository.full_name || this.payload.repository.name);
      const logs = await fetchBuildLogs(this.env, workerName);
      if (!logs) return;

      const analysis = await analyzeBuildFailure(this.env, logs, {
        prNumber,
        prTitle: prRes.data.title,
        headRef: prRes.data.head?.ref || '',
        repoFullName: this.payload.repository.full_name || `${this.payload.repository.owner?.login}/${this.payload.repository.name}`,
      });

      const commentBody = appendSignature(formatBuildFailureComment(agentInfo.tag, prNumber, analysis));
      await octokit.rest.issues.createComment({
        owner: this.payload.repository.owner?.login,
        repo: this.payload.repository.name,
        issue_number: prNumber,
        body: commentBody,
      });
      await this.logExecution('success', 'Analyzed build failure and posted comment', prNumber);
    } catch (error: unknown) {
      console.error('[BuildAnalyzer] Failed to analyze build failure:', error);
      await this.logExecution('failure', `BuildAnalyzer failed: ${error.message}`);
    }
  }
}
