import type { ColbyCommandContext } from '@/automations/shared/colby/contracts';
import { buildRepositorySyncSecretPlan } from '@/services/repository-secret-defaults';
import { syncRepoSecrets, type SecretDefinition } from '@/services/github/secrets-manager';

export async function buildSyncSecretPlan(env: Env): Promise<SecretDefinition[]> {
  return buildRepositorySyncSecretPlan(env);
}

export async function applySyncSecrets(ctx: ColbyCommandContext): Promise<SecretDefinition[]> {
  const secrets = await buildSyncSecretPlan(ctx.env);
  if (!secrets.length) {
    return [];
  }

  await syncRepoSecrets(ctx.env, ctx.repo.owner, ctx.repo.name, secrets, ctx.octokit);
  return secrets;
}
