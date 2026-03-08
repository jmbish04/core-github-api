import type { CommandResult, ISlashCommand } from '../fixers/types';

export const ExtractCommand: ISlashCommand = {
  name: 'extract',
  description: 'Extract comments digest.',
  async handle(): Promise<CommandResult | null> {
    return { type: 'reply', body: "🔍 Extracting comments..." };
  }
};
