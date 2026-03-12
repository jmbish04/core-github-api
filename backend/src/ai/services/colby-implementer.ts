import type {
  ColbyCommandContext,
  ColbyCommandResult,
} from '@/automations/shared/colby/contracts';
import { generateStructuredResponse } from '@/ai/providers';
import { withFullCodeOutputRules } from '@/ai/utils/code-output-rules';
import { Logger } from '@/lib/logger';

export class Implementer {
  private readonly logger: Logger;

  constructor(private readonly env: Env) {
    this.logger = new Logger(env, 'ai/services/colby-implementer');
  }

  async scaffoldFromIssue(
    ctx: ColbyCommandContext,
    instructions: string,
    issueNumber: number,
    issueBody: string,
  ): Promise<ColbyCommandResult> {
    this.logger.info(`Scaffolding for issue #${issueNumber}`);

    let fileTreeStr = 'Server Error: Could not fetch tree';
    try {
      const { data: treeData } = await ctx.octokit.rest.git.getTree({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        tree_sha: ctx.repo.defaultBranch,
        recursive: 'true',
      });
      const paths = treeData.tree.map((treeNode: any) => treeNode.path).join('\n');
      fileTreeStr = paths.substring(0, 10000);
    } catch (error) {
      this.logger.error('Failed to get tree', { error });
    }

    const branchName = `colby/feature-${issueNumber}-${Date.now()}`;

    try {
      const { data: refData } = await ctx.octokit.rest.git.getRef({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        ref: `heads/${ctx.repo.defaultBranch}`,
      });
      const baseSha = refData.object.sha;

      await ctx.octokit.rest.git.createRef({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      });

      this.logger.info(`Running AI planner for issue #${issueNumber}`);

      const systemPrompt = withFullCodeOutputRules(
        'You are an expert staff software engineer. Create a well-structured implementation file based on the issue and repository context. The returned `fileContent` must be the complete file content.',
      );
      const prompt = `Using this file tree:\n${fileTreeStr}\n\nIssue:\n${issueBody}\n\nExtra instructions:\n${instructions}`;

      const schema = {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'The path of the primary new file to create.',
          },
          fileContent: {
            type: 'string',
            description: 'The entire code content for this new file.',
          },
          prTitle: {
            type: 'string',
            description: 'A concise pull request title.',
          },
          prDescription: {
            type: 'string',
            description: 'A markdown summary of what was implemented.',
          },
        },
        required: ['filePath', 'fileContent', 'prTitle', 'prDescription'],
        additionalProperties: false,
      };

      const plan = await generateStructuredResponse<{
        filePath: string;
        fileContent: string;
        prTitle: string;
        prDescription: string;
      }>(
        ctx.env,
        prompt,
        schema,
        systemPrompt,
        { model: '@cf/meta/llama-3.1-8b-instruct' },
        'worker-ai',
      );

      await ctx.octokit.rest.repos.createOrUpdateFileContents({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        path: plan.filePath,
        message: `feat: implement issue #${issueNumber}`,
        content: btoa(plan.fileContent),
        branch: branchName,
      });

      const { data: pr } = await ctx.octokit.rest.pulls.create({
        owner: ctx.repo.owner,
        repo: ctx.repo.name,
        title: plan.prTitle,
        head: branchName,
        base: ctx.repo.defaultBranch,
        body: `${plan.prDescription}\n\nTriggered by: \`/colby implement\``,
      });

      return {
        type: 'reply',
        body: `🚀 **I have started working on this.**\n\nI created a new branch and pull request with a scaffold: ${pr.html_url}`,
      };
    } catch (error: any) {
      this.logger.error('Failed execution', { error });
      return {
        type: 'reply',
        body: `❌ **Failed to scaffold:** ${error.message}`,
      };
    }
  }

  async generateTests(_ctx: ColbyCommandContext): Promise<ColbyCommandResult> {
    return {
      type: 'reply',
      body: '🧪 **Generating tests...** (Mock: Not implemented yet)',
    };
  }
}
