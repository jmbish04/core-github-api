import { BaseAutomation } from '@/core/BaseAutomation';
import type { GitHubPullRequestPayload } from '@/types/github/webhooks';
import { appendSignature } from "@/utils/github/signature";
import { withCompatOctokit } from "@/services/octokit/compat";
import { GitHubConditionals } from '@/utils/github/conditionals';

export class GeminiReview extends BaseAutomation<GitHubPullRequestPayload> {
  async shouldExecute(): Promise<boolean> {
    const action = this.payload.action;
    return (action === 'synchronize' || action === 'ready_for_review') && !!this.payload.pull_request;
  }

  async execute(): Promise<void> {
    const octokit = withCompatOctokit(await this.getGitHubClient());
    const prNumber = this.payload.pull_request?.number;
    const owner = this.payload.repository?.owner?.login;
    const repo = this.payload.repository?.name;

    if (!prNumber || !owner || !repo) {
       await this.logExecution('failure', 'Missing PR details');
       return;
    }
    
    if (this.payload.pull_request?.draft && this.payload.action !== 'ready_for_review') {
       await this.logExecution('skipped', 'PR is still draft');
       return;
    }

    try {
      const existingComments = await octokit.rest.issues.listComments({ owner, repo, issue_number: prNumber, per_page: 50 });
      const alreadyRequested = GitHubConditionals.hasCommentCommand(existingComments.data, '/gemini review');
      
      if (alreadyRequested) {
        await this.logExecution('skipped', 'Review already requested', prNumber);
        return;
      }

      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: appendSignature('/gemini review'),
      });
      
      await this.logExecution('success', 'Added /gemini review comment', prNumber);
    } catch (err: unknown) {
      await this.logExecution('failure', `Failed to request review: ${this.getErrorMessage(err)}`, prNumber);
    }
  }
}
