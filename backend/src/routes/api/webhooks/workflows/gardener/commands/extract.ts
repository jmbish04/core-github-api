import { ISlashCommand, CommandResult } from './types';

export const ExtractCommand: ISlashCommand = {
  name: 'extract',
  description: 'Extract comments digest.',
  async handle(): Promise<CommandResult | null> {
    return { type: 'reply', body: "🔍 Extracting comments..." };
  }
};
