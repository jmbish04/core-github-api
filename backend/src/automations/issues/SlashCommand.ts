import { BaseAutomation } from '@/core/BaseAutomation';
import { SlashCommandRouter } from "@/routes/api/webhooks/workflows/gardener/router";
import { withCompatOctokit } from "@/services/octokit/compat";

export class SlashCommand extends BaseAutomation {
  private c: unknown;

  constructor(env: Env, payload: unknown, installationId: number | undefined, usePat: boolean, c: unknown) {
    super(env, payload, installationId, usePat);
    this.c = c;
  }

  async shouldExecute(): Promise<boolean> {
    const isIssue = !!this.payload.issue && !this.payload.comment;
    const isIssueComment = !!this.payload.comment;
    
    if (isIssue) {
      if (this.payload.action === 'opened' || this.payload.action === 'edited') {
          return this.payload.issue?.body?.includes('/colby') || false;
      }
    } else if (isIssueComment) {
      if (this.payload.action === 'created') {
          return this.payload.comment?.body?.includes('/colby') || false;
      }
    }
    return false;
  }

  async execute(): Promise<void> {
    try {
      const octokit = withCompatOctokit(await this.getGitHubClient());
      const body = this.payload.comment ? this.payload.comment.body : this.payload.issue?.body;

      await SlashCommandRouter.handleAndReply(
        body,
        {
          env: this.env,
          executionCtx: { ...(this.c as { executionCtx: unknown }).executionCtx, exports: {} as Record<string, unknown> },
          repo: { 
            owner: this.payload.repository?.owner?.login, 
            name: this.payload.repository?.name, 
            defaultBranch: this.payload.repository?.default_branch 
          },
          octokit
        },
        { issueNumber: this.payload.issue?.number, issueBody: this.payload.issue?.body }
      );
      await this.logExecution('success', 'Slash command processed');
    } catch (err: unknown) {
      console.error('[SlashCommand] Failed:', err);
      await this.logExecution('failure', `Slash command failed: ${err.message}`);
    }
  }
}
