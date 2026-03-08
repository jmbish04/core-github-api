import { GardenerContext } from '../types';

export interface CommandResult {
  type: 'reply' | 'ignore';
  body?: string;
}

export interface ISlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  handle(args: string, ctx: GardenerContext, metadata: { issueNumber?: number; issueBody?: string }): Promise<CommandResult | null>;
}
