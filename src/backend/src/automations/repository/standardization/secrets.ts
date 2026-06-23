import { buildRepositorySyncSecretPlanReport } from '@/services/repository-secret-defaults';
import { syncRepoSecrets } from '@/services/github/secrets-manager';

export interface SecretProvisioningResult {
  status: 'synced' | 'skipped';
  syncedSecretNames: string[];
  missingSecretNames: string[];
  reason?: string;
}

export class SecretSync {
  /**
   * Auto-provisions repository secrets from active defaults.
   * Returns a diagnostic result that explains whether secrets were synced or skipped.
   */
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

    const results = await syncRepoSecrets(env, owner, repo, secretsToSync, octokit);
    const syncedSecretNames = results
      .filter((r) => r.status === 'updated')
      .map((r) => r.name);
    const failed = results.filter((r) => r.status === 'error');

    return {
      status: syncedSecretNames.length > 0 ? 'synced' : 'skipped',
      syncedSecretNames,
      missingSecretNames: plan.missingSecretNames,
      reason:
        failed.length > 0
          ? `Failed to sync: ${failed.map((f) => `${f.name} (${f.error})`).join(', ')}`
          : undefined,
    };
  }
}
