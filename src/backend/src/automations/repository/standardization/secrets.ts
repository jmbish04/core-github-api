import { buildRepositorySyncSecretPlanReport } from '@/services/repository-secret-defaults';
import { syncRepoSecrets } from '@/services/github/secrets-manager';

export interface SecretProvisioningResult {
  status: 'synced' | 'skipped';
  syncedSecretNames: string[];
  missingSecretNames: string[];
  reason?: string;
}

export class SecretSync {
  static async autoProvisionSecrets(
    env: Env,
    owner: string,
    repo: string,
    octokit: any,
  ): Promise<SecretProvisioningResult> {
    const plan = await buildRepositorySyncSecretPlanReport(env);
    const secretsToSync = plan.secrets;

    if (!secretsToSync.length) {
      const reason = plan.activeSecretNames.length
        ? `No active repository default secrets resolved from Worker environment values. Missing: ${plan.missingSecretNames.join(', ')}`
        : 'No active repository secret defaults are configured.';
      return {
        status: 'skipped',
        syncedSecretNames: [],
        missingSecretNames: plan.missingSecretNames,
        reason,
      };
    }

    await syncRepoSecrets(env, owner, repo, secretsToSync, octokit);

    return {
      status: 'synced',
      syncedSecretNames: secretsToSync.map((secret) => secret.name),
      missingSecretNames: plan.missingSecretNames,
    };
  }
}
