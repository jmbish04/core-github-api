import { BaseAutomation } from '@/core/BaseAutomation';
import { withCompatOctokit } from "@/services/octokit/compat";
import { appendSignature } from "@/utils/github/signature";
import {
  isCodeReviewBot,
  formatAgentFixComment,
  detectPRAuthorAgent,
  type ExtractedReviewComment,
} from "@/routes/api/webhooks/workflows/pr-agent-tagger";

type PullRequestReviewPayload = {
  action?: string;
  review?: { user?: { login?: string } };
  pull_request?: {
    number?: number;
    head?: { ref?: string };
    body?: string | null;
    user?: { login?: string; html_url?: string };
  };
  repository?: { owner?: { login?: string }; name?: string };
};

export class AgentTagger extends BaseAutomation<PullRequestReviewPayload> {
  async shouldExecute(): Promise<boolean> {
    if (this.payload.action !== 'submitted' || !this.payload.review?.user?.login) return false;
    return isCodeReviewBot(this.payload.review.user.login);
  }

  async execute(): Promise<void> {
    try {
      const prData = this.payload.pull_request;
      const reviewerLogin = this.payload.review?.user?.login;
      const repository = this.payload.repository;
      const repoOwner = repository?.owner?.login;
      const repoName = repository?.name;
      const prNumber = prData?.number;
      if (!prData || !reviewerLogin || !repoOwner || !repoName || !prNumber) return;

      const octokit = withCompatOctokit(await this.getGitHubClient());
      type IssueComment = Awaited<ReturnType<typeof octokit.rest.issues.listComments>>['data'][number];
      type ReviewComment = Awaited<ReturnType<typeof octokit.rest.pulls.listReviewComments>>['data'][number];
      
      const issueCommentsRes = await octokit.rest.issues.listComments({
        owner: repoOwner,
        repo: repoName,
        issue_number: prNumber,
        per_page: 100,
      });

      const agentInfo = detectPRAuthorAgent({
        headRef: prData.head?.ref,
        body: prData.body,
        authorLogin: prData.user?.login,
        authorHtmlUrl: prData.user?.html_url,
        issueComments: issueCommentsRes.data.map((comment: IssueComment) => ({ body: comment.body || "" })),
      });

      if (!agentInfo) return;

      const reviewCommentsRes = await octokit.rest.pulls.listReviewComments({
        owner: repoOwner,
        repo: repoName,
        pull_number: prNumber,
        per_page: 100,
      });

      const botComments: ExtractedReviewComment[] = reviewCommentsRes.data
        .filter((comment: ReviewComment) => comment.user?.login === reviewerLogin)
        .map((comment: ReviewComment) => ({
          path: comment.path || '',
          line: comment.line || comment.original_line || null,
          body: comment.body || '',
          diff_hunk: comment.diff_hunk,
          suggestion: comment.body?.match(/```suggestion\n([\s\S]*?)\n```/)?.[1] || undefined,
        }));

      if (botComments.length === 0) return;

      const commentBody = appendSignature(formatAgentFixComment(agentInfo.tag, prNumber, botComments));
      await octokit.rest.issues.createComment({
        owner: repoOwner,
        repo: repoName,
        issue_number: prNumber,
        body: commentBody,
      });
      await this.logExecution('success', 'Agent fix comment tagged', prNumber);
    } catch (e: unknown) {
      console.error('[AgentTagger] failed:', e);
      await this.logExecution('failure', `AgentTagger failed: ${this.getErrorMessage(e)}`, this.payload.pull_request?.number);
    }
  }
}
