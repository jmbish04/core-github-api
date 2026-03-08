import { ISlashCommand, CommandResult } from './types';

export const StandardizeCommand: ISlashCommand = {
  name: 'standardize',
  description: 'Full repo audit & fix (Coming Soon).',
  async handle(): Promise<CommandResult | null> {
    return { type: 'reply', body: "🛠️ **Standardization** is coming soon!" };
  }
};
