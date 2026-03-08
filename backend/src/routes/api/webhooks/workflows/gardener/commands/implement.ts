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
    return new Implementer(ctx.env).scaffoldFromIssue(ctx, args, metadata.issueNumber, metadata.issueBody);
  }
};
