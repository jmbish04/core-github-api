import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/automations/core/BaseAutomation';
import { applySyncManifestToBranch, buildSyncManifest } from '@/automations/push/orchestration/sync';
import { McpSync } from './mcp';
import { RulesStandardization } from './rules';
import { SecretSync, type SecretProvisioningResult } from './secrets';
import { ensureRepositorySpecialist } from './specialist';

const RepoStandardizationPayloadSchema = z.object({
  action: z.string().optional(),
  repository: z.object({
    name: z.string(),
    full_name: z.string().optional(),
    default_branch: z.string().optional().default('main'),
    owner: z.object({
      login: z.string(),
    }),
  }),
});

const InstallationRepositoriesPayloadSchema = z.object({
  action: z.string().optional(),
  repositories_added: z
    .array(
      z.object({
        name: z.string(),
        full_name: z.string(),
      }),
    )
    .optional()
    .default([]),
});

type RepoStandardizationPayload = z.infer<typeof RepoStandardizationPayloadSchema>;
type InstallationRepositoriesPayload = z.infer<typeof InstallationRepositoriesPayloadSchema>;

function parseRepositoryFullName(fullName: string): { owner: string; name: string } | null {
  const parts = fullName.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return { owner: parts[0], name: parts[1] };
}

function isRepositoryEventPayload(payload: unknown): payload is RepoStandardizationPayload {
  return RepoStandardizationPayloadSchema.safeParse(payload).success;
}

export async function enforceRepositoryStandardization(
  env: Env,
  repository: { owner: { login: string }; name: string; default_branch?: string },
  octokit: any,
): Promise<SecretProvisioningResult> {
  await RulesStandardization.enforce(env, repository, octokit);
  await ensureRepositorySpecialist(env, repository.owner.login, repository.name, octokit);
  await McpSync.syncMcpConfig(env, repository.owner.login, repository.name, octokit);
  return SecretSync.autoProvisionSecrets(env, repository.owner.login, repository.name, octokit);
}

async function bootstrapSyncAssets(
  env: Env,
  octokit: any,
  payload: RepoStandardizationPayload,
): Promise<void> {
  const manifest = await buildSyncManifest(env, octokit, {
    owner: payload.repository.owner.login,
    name: payload.repository.name,
    defaultBranch: payload.repository.default_branch,
  });

  await applySyncManifestToBranch(
    octokit,
    {
      owner: payload.repository.owner.login,
      name: payload.repository.name,
      defaultBranch: payload.repository.default_branch,
    },
    payload.repository.default_branch,
    manifest,
  );
}

export class RepoStandardization extends BaseAutomation<
  RepoStandardizationPayload | InstallationRepositoriesPayload
> {
  static readonly metadata: AutomationMetadata = {
    key: 'repo-standardization',
    domain: 'repository',
    description: 'Bootstraps and enforces repository-wide standardization artifacts.',
    events: ['repository', 'installation_repositories'],
    alwaysOn: false,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName === 'repository') {
      return isRepositoryEventPayload(this.payload);
    }

    if (this.eventName === 'installation_repositories') {
      const parseResult = InstallationRepositoriesPayloadSchema.safeParse(this.payload);
      return (
        this.action === 'added' &&
        parseResult.success &&
        parseResult.data.repositories_added.length > 0
      );
    }

    return false;
  }

  async run(): Promise<void> {
    try {
      const octokit = await this.getGitHubClient();
      const provisioningSummaries: string[] = [];

      if (this.eventName === 'repository') {
        const payload = RepoStandardizationPayloadSchema.parse(this.payload);
        const secretProvisioning = await enforceRepositoryStandardization(
          this.env,
          {
            owner: { login: payload.repository.owner.login },
            name: payload.repository.name,
            default_branch: payload.repository.default_branch,
          },
          octokit,
        );

        provisioningSummaries.push(
          `${payload.repository.owner.login}/${payload.repository.name}: ${secretProvisioning.status}${
            secretProvisioning.reason ? ` (${secretProvisioning.reason})` : ''
          }`,
        );

        if (this.action === 'created') {
          await bootstrapSyncAssets(this.env, octokit, payload);
        }
      }

      if (this.eventName === 'installation_repositories') {
        const payload = InstallationRepositoriesPayloadSchema.parse(this.payload);
        const results = await Promise.allSettled(
          payload.repositories_added.map(async (repository) => {
            const parsed = parseRepositoryFullName(repository.full_name);
            if (!parsed) {
              return `skipped:${repository.full_name}:invalid_full_name`;
            }

            const secretProvisioning = await enforceRepositoryStandardization(
              this.env,
              {
                owner: { login: parsed.owner },
                name: parsed.name,
              },
              octokit,
            );

            return `${repository.full_name}:${secretProvisioning.status}${
              secretProvisioning.reason ? ` (${secretProvisioning.reason})` : ''
            }`;
          }),
        );

        const failures: string[] = [];
        for (const result of results) {
          if (result.status === 'fulfilled') {
            provisioningSummaries.push(result.value);
            continue;
          }

          failures.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        }

        if (failures.length > 0) {
          throw new Error(
            `Standardization failed for ${failures.length} added repositories: ${failures.join(' | ')}`,
          );
        }
      }

      await this.logExecution(
        'success',
        `Repository standardization completed. ${provisioningSummaries.join(' | ')}`,
      );
    } catch (error) {
      await this.logExecution(
        'failure',
        `Repository standardization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
