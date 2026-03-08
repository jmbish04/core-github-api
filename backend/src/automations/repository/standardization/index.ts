import { AgentGenerator } from './agent';
import { McpSync } from './mcp';
import { RulesStandardization } from './rules';
import { SecretSync } from './secrets';

export { AgentGenerator } from './agent';
export { McpSync } from './mcp';
export { SecretSync } from './secrets';
export { RulesStandardization } from './rules';

export class RepositoryStandardization {
  static async enforce(env: Env, repository: any, octokit?: any) {
    const owner = repository.owner.login;
    const repo = repository.name;

    console.log(`[RepositoryStandardization] Enforcing standards for ${owner}/${repo}...`);

    await RulesStandardization.enforce(env, repository, octokit);
    await AgentGenerator.ensureAgent(env, owner, repo, octokit);
    await McpSync.syncMcpConfig(env, owner, repo, octokit);
    await SecretSync.autoProvisionSecrets(env, owner, repo, octokit);

    console.log(`[RepositoryStandardization] Completed standardization for ${owner}/${repo}`);
  }
}
