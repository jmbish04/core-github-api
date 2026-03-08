import { ISlashCommand, CommandResult } from './types';
import { Implementer } from '../agents/implementer';

export const ImplementCommand: ISlashCommand = {
  name: 'implement',
  aliases: ['take'],
  description: 'Scaffold code for an issue based on instructions.',
  async handle(args, ctx, metadata): Promise<CommandResult | null> {
    if (!metadata.issueNumber || !metadata.issueBody) {
        return { type: 'reply', body: "❌ `/colby implement` must be used in a valid Issue context." };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new (Implementer as any)({} as any, ctx.env).scaffoldFromIssue(ctx, args, metadata.issueNumber, metadata.issueBody);
  }
};
