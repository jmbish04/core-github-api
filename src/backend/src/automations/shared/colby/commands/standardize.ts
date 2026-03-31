import { enforceRepositoryStandardization } from '@/automations/repository/standardization';
import type { ColbyCommandDefinition } from '../contracts';

export const StandardizeCommand: ColbyCommandDefinition = {
  domain: 'repository',
  name: 'standardize',
  description: 'Apply repository standardization rules and sync core artifacts.',
  async execute(_invocation, ctx) {
    await enforceRepositoryStandardization(
      ctx.env,
      {
        owner: { login: ctx.repo.owner },
        name: ctx.repo.name,
        default_branch: ctx.repo.defaultBranch,
      },
      ctx.octokit,
    );

    return {
      type: 'reply',
      body: `Applied repository standardization to ${ctx.repo.owner}/${ctx.repo.name}.`,
    };
  },
};
