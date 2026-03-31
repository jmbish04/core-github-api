import type { ColbyRouteModule } from '../contracts';
import { HelpCommand } from '../commands/help';

export const issuesColbyRoute: ColbyRouteModule = {
  domain: 'issues',
  commands: [HelpCommand],
};
