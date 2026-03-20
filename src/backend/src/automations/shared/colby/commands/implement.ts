import { Implementer } from '@/ai/services/colby-implementer';
import type {
  ColbyCommandContext,
  ColbyCommandDefinition,
  ColbyCommandResult,
} from '../contracts';

function createImplementer(env: Env): Implementer {
  return new Implementer(env);
}

async function getIssueBody(ctx: ColbyCommandContext): Promise<string> {
  const issue = await ctx.octokit.rest.issues.get({
    owner: ctx.repo.owner,
    repo: ctx.repo.name,
    issue_number: ctx.thread.number,
  });

  return issue.data.body || '';
}

export async function runImplementation(
  ctx: ColbyCommandContext,
  instructions: string,
): Promise<ColbyCommandResult> {
  const issueBody = await getIssueBody(ctx);
  return createImplementer(ctx.env).scaffoldFromIssue(
    ctx,
    instructions,
    ctx.thread.number,
    issueBody,
  );
}

export async function runImplementationTests(
  ctx: ColbyCommandContext,
): Promise<ColbyCommandResult> {
  return createImplementer(ctx.env).generateTests(ctx);
}

export const ImplementCommand: ColbyCommandDefinition = {
  domain: 'push',
  name: 'implement',
  aliases: ['take'],
  description: 'Scaffold code for an issue based on inline instructions.',
  async execute(invocation, ctx) {
    if (ctx.thread.isPullRequest) {
      return {
        type: 'reply',
        body: '❌ `/colby implement` is intended for issue threads, not pull request review threads.',
      };
    }

    return runImplementation(ctx, invocation.args);
  },
};
