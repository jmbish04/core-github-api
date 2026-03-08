import { ISlashCommand, CommandResult } from './types';
import { FixTypesCommand } from './fix-types';
import { FixAllCommand } from './fix-all';
import { ResolveConflictsCommand } from './resolve-conflicts';
import { ImplementCommand } from './implement';
import { TestCommand } from './test';
import { ExtractCommand } from './extract';
import { StandardizeCommand } from './standardize';

export const ALL_COMMANDS: ISlashCommand[] = [
  StandardizeCommand,
  FixTypesCommand,
  FixAllCommand,
  ResolveConflictsCommand,
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
