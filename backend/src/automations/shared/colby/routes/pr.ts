import type { ColbyRouteModule } from '../contracts';
import { ReviewCommand } from '../commands/review';
import { SummaryCommand } from '../commands/summary';

export const prColbyRoute: ColbyRouteModule = {
  domain: 'pr',
  commands: [ReviewCommand, SummaryCommand],
};
