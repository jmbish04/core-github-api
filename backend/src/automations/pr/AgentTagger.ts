import { BaseAutomation } from '@/core/BaseAutomation';
import { withCompatOctokit } from "@/services/octokit/compat";
import { appendSignature } from "@/utils/github/signature";
import {
  isCodeReviewBot,
  formatAgentFixComment,
  detectPRAuthorAgent,
  type ExtractedReviewComment,
} from "@/routes/api/webhooks/workflows/pr-agent-tagger";

export class AgentTagger extends BaseAutomation {
  async shouldExecute(): Promise<boolean> {
    if (this.payload.action !== 'submitted' || !this.payload.review?.user?.login) return false;
    return isCodeReviewBot(this.payload.review.user.login);
  }

  async execute(): Promise<void> {
    try {
      const prData = this.payload.pull_request;
      const reviewerLogin = this.payload.review.user.login;
      if (!prData || !this.payload.repository) return;

      const octokit = withCompatOctokit(await this.getGitHubClient());
      
      const issueCommentsRes = await octokit.rest.issues.listComments({
        owner: this.payload.repository.owner?.login,
        repo: this.payload.repository.name,
        issue_number: prData.number,
        per_page: 100,
      });

      const agentInfo = detectPRAuthorAgent({
        headRef: prData.head?.ref,
        body: prData.body,
        authorLogin: prData.user?.login,
        authorHtmlUrl: prData.user?.html_url,
        issueComments: issueCommentsRes.data.map((c: Record<string, unknown>) => ({ body: (c.body as string) || "" })),
      });

      if (!agentInfo) return;

      const reviewCommentsRes = await octokit.rest.pulls.listReviewComments({
        owner: this.payload.repository.owner?.login,
        repo: this.payload.repository.name,
        pull_number: prData.number,
        per_page: 100,
      });

      const botComments: ExtractedReviewComment[] = reviewCommentsRes.data
        .filter((c: Record<string, unknown>) => (c.user as { login?: string })?.login === reviewerLogin)
        .map((c: Record<string, unknown>) => ({
          path: c.path || '',
          line: c.line || c.original_line || null,
          body: c.body || '',
          diff_hunk: c.diff_hunk,
          suggestion: c.body?.match(/```suggestion\n([\s\S]*?)\n```/)?.[1] || undefined,
        }));

      if (botComments.length === 0) return;

      const commentBody = appendSignature(formatAgentFixComment(agentInfo.tag, prData.number, botComments));
      await octokit.rest.issues.createComment({
        owner: this.payload.repository.owner?.login,
        repo: this.payload.repository.name,
        issue_number: prData.number,
        body: commentBody,
      });
      await this.logExecution('success', 'Agent fix comment tagged', prData.number);
    } catch (e: unknown) {
      console.error('[AgentTagger] failed:', e);
      await this.logExecution('failure', `AgentTagger failed: ${e.message}`, this.payload.pull_request?.number);
    }
  }
}
