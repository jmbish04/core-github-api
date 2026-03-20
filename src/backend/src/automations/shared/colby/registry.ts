import type { ColbyCommandDefinition } from './contracts';
import { issuesColbyRoute } from './routes/issues';
import { prColbyRoute } from './routes/pr';
import { pushColbyRoute } from './routes/push';
import { repositoryColbyRoute } from './routes/repository';
import { securityColbyRoute } from './routes/security';

export const COLBY_ROUTE_MODULES = [
  issuesColbyRoute,
  prColbyRoute,
  pushColbyRoute,
  repositoryColbyRoute,
  securityColbyRoute,
];

export const COLBY_COMMANDS: ColbyCommandDefinition[] = COLBY_ROUTE_MODULES.flatMap(
  (route) => route.commands,
);

export function findColbyCommand(name: string): ColbyCommandDefinition | undefined {
  const normalized = name.trim().toLowerCase();
  return COLBY_COMMANDS.find(
    (command) =>
      command.name === normalized ||
      command.aliases?.some((alias) => alias.toLowerCase() === normalized),
  );
}
