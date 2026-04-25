import type { ColbyRouteModule } from '../contracts';
import { ExtractCommand } from '../commands/extract';
import { TestCommand } from '../commands/test';
import { FixAllCommand } from '../fixers/all';
import { ResolveCommentsCommand } from '../fixers/comments';
import { FixTypesCommand } from '../fixers/types';

export const pushColbyRoute: ColbyRouteModule = {
  domain: 'push',
  commands: [
    ExtractCommand,
    TestCommand,
    FixAllCommand,
    FixTypesCommand,
    ResolveCommentsCommand,
  ],
};
