import { buildRepositorySyncSecretPlan } from '@/services/repository-secret-defaults';
import { syncRepoSecrets } from '@/services/github/secrets-manager';

export class SecretSync {
  static async autoProvisionSecrets(env: Env, owner: string, repo: string, octokit: any) {
    const secretsToSync = await buildRepositorySyncSecretPlan(env);

    if (!secretsToSync.length) {
      return;
    }

    await syncRepoSecrets(env, owner, repo, secretsToSync, octokit);
  }
}
