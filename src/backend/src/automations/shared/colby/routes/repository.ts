import type { ColbyRouteModule } from '../contracts';
import { StandardizeCommand } from '../commands/standardize';

export const repositoryColbyRoute: ColbyRouteModule = {
  domain: 'repository',
  commands: [StandardizeCommand],
};
