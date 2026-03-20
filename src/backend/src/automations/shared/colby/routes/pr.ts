import type { ColbyRouteModule } from '../contracts';
import { ReviewCommand } from '../commands/review';
import { SummaryCommand } from '../commands/summary';
import { CodeCommentsCommand } from '../commands/code_comments';

export const prColbyRoute: ColbyRouteModule = {
  domain: 'pr',
  commands: [ReviewCommand, SummaryCommand, CodeCommentsCommand],
};
