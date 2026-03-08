import { ImplementCommand } from './implement';
import { FixAllCommand } from '../fixers/fix_all';
import { ResolveCommentsCommand } from '../fixers/comments';
import { FixTypesCommand, type CommandResult, type ISlashCommand } from '../fixers/worker_types';
import { TestCommand } from './test';
import { ExtractCommand } from './extract';
import { StandardizeCommand } from './standardize';

export const ALL_COMMANDS: ISlashCommand[] = [
  StandardizeCommand,
  FixTypesCommand,
  FixAllCommand,
  ResolveCommentsCommand,
  ImplementCommand,
  TestCommand,
  ExtractCommand
];

export const HelpCommand: ISlashCommand = {
  name: 'help',
  description: 'Show this help menu.',
  async handle(): Promise<CommandResult | null> {
    let body = `### 🤖 Colby Command Menu\n\n`;
    for (const cmd of ALL_COMMANDS) {
      const aliasText = cmd.aliases && cmd.aliases.length > 0 ? ` (aliases: ${cmd.aliases.join(', ')})` : '';
      body += `- \`/colby ${cmd.name}\`${aliasText}: ${cmd.description}\n`;
    }
    body += `- \`/colby help\`: Show this help menu.\n`;
    return { type: 'reply', body };
  }
};

export const CommandRegistry = [...ALL_COMMANDS, HelpCommand];
