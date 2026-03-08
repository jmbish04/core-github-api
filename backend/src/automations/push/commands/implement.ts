import { Implementer } from '@/ai/agents/automations/push/implementer';
import type { CommandResult, ISlashCommand, PushContext } from '../fixers/types';

function createImplementer(env: Env): Implementer {
  return new (Implementer as any)({} as any, env);
}

export async function runImplementation(
  ctx: PushContext,
  instructions: string,
  issueNumber: number,
  issueBody: string,
): Promise<CommandResult> {
  return createImplementer(ctx.env).scaffoldFromIssue(ctx, instructions, issueNumber, issueBody);
}

export async function runImplementationTests(ctx: PushContext): Promise<CommandResult> {
  return createImplementer(ctx.env).generateTests(ctx);
}

export const ImplementCommand: ISlashCommand = {
  name: 'implement',
  aliases: ['take'],
  description: 'Scaffold code for an issue based on instructions.',
  async handle(args, ctx, metadata): Promise<CommandResult | null> {
    if (!metadata.issueNumber || !metadata.issueBody) {
      return {
        type: 'reply',
        body: '❌ `/colby implement` must be used in a valid issue context.',
      };
    }

    return runImplementation(ctx, args, metadata.issueNumber, metadata.issueBody);
  },
};
