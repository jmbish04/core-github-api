import { appendSignature } from '@/utils/github/signature';
import type {
  ColbyCommandContext,
  ColbyCommandResult,
  ColbyInvocation,
} from './contracts';
import { prependColbyPrimer } from './primer';
import { findColbyCommand } from './registry';

function formatReplyBody(ctx: ColbyCommandContext, result: ColbyCommandResult): string {
  const reply = result.body || '';
  const withPrimer = ctx.thread.isPullRequest && !result.skipPrimer ? prependColbyPrimer(reply) : reply;
  return appendSignature(withPrimer);
}

export async function routeColbyInvocation(
  invocation: ColbyInvocation,
  ctx: ColbyCommandContext,
): Promise<ColbyCommandResult | null> {
  const command = findColbyCommand(invocation.command);
  if (!command) {
    return {
      type: 'reply',
      body: `🤖 Unknown command: \`${invocation.command}\`. Try \`/colby help\`.`,
    };
  }

  if (command.requiresPr && !ctx.thread.isPullRequest) {
    return {
      type: 'reply',
      body: `❌ \`${invocation.command}\` can only be used from a pull request context.`,
    };
  }

  return command.execute(invocation, ctx);
}

export async function handleColbyInvocationAndReply(
  invocation: ColbyInvocation,
  ctx: ColbyCommandContext,
): Promise<ColbyCommandResult | null> {
  const result = await routeColbyInvocation(invocation, ctx);
  if (!result || result.type !== 'reply' || !result.body) {
    return result;
  }

  await ctx.octokit.rest.issues.createComment({
    owner: ctx.repo.owner,
    repo: ctx.repo.name,
    issue_number: ctx.thread.number,
    body: formatReplyBody(ctx, result),
  });

  return result;
}
