import { BaseAutomation } from '@/core/BaseAutomation';
import type { GitHubIssueCommentPayload, GitHubIssuesPayload } from '@/types/github/webhooks';
import { SlashCommandRouter } from "@/routes/api/webhooks/workflows/gardener/router";
import type { GardenerContext } from "@/routes/api/webhooks/workflows/gardener/types";
import { withCompatOctokit } from "@/services/octokit/compat";
import type { Context } from 'hono';

type SlashCommandPayload = {
  action?: GitHubIssuesPayload['action'] | GitHubIssueCommentPayload['action'];
  issue?: GitHubIssuesPayload['issue'];
  comment?: GitHubIssueCommentPayload['comment'];
  repository?: GitHubIssuesPayload['repository'];
};

export class SlashCommand extends BaseAutomation<SlashCommandPayload> {
  private c: Context<{ Bindings: Env }>;

  constructor(env: Env, payload: SlashCommandPayload, installationId: number | undefined, usePat: boolean, c: Context<{ Bindings: Env }>) {
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
      const repository = this.payload.repository;
      const issueNumber = this.payload.issue?.number;

      if (!body || !repository?.owner?.login || !repository.name || !repository.default_branch || !issueNumber) {
        await this.logExecution('skipped', 'Slash command payload was missing issue or repository context');
        return;
      }

      await SlashCommandRouter.handleAndReply(
        body,
        {
          env: this.env,
          executionCtx: this.c.executionCtx as GardenerContext['executionCtx'],
          repo: { 
            owner: repository.owner.login, 
            name: repository.name, 
            defaultBranch: repository.default_branch,
          },
          octokit,
        },
        { issueNumber, issueBody: this.payload.issue?.body ?? undefined }
      );
      await this.logExecution('success', 'Slash command processed');
    } catch (err: unknown) {
      console.error('[SlashCommand] Failed:', err);
      await this.logExecution('failure', `Slash command failed: ${this.getErrorMessage(err)}`);
    }
  }
}
