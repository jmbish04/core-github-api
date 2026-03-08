import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/core/BaseAutomation';
import { appendSignature } from '@/utils/github/signature';
import { RepositoryStandardization } from '@/automations/repository/standardization';

const RepoStandardizationPayloadSchema = z.object({
  action: z.string().optional(),
  repository: z.object({
    name: z.string(),
    full_name: z.string().optional(),
    owner: z.object({
      login: z.string(),
    }),
  }),
});

type RepoStandardizationPayload = z.infer<typeof RepoStandardizationPayloadSchema>;

export class RepoStandardization extends BaseAutomation<RepoStandardizationPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'repo-standardization',
    domain: 'repository',
    description: 'Bootstraps and enforces repository-wide standardization artifacts.',
    events: ['repository'],
    alwaysOn: false,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    return this.eventName === 'repository' && RepoStandardizationPayloadSchema.safeParse(this.payload).success;
  }

  private async ensureJulesMaintainerWorkflow(payload: RepoStandardizationPayload): Promise<void> {
    if (this.action !== 'created') {
      return;
    }

    const octokit = await this.getGitHubClient();
    const workflowContent = `name: Jules Maintainer
on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  notify-jules:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Core GitHub API
        run: |
          curl -X POST "\${{ secrets.CORE_API_URL }}/api/webhooks" \\
          -H "Content-Type: application/json" \\
          -H "X-GitHub-Event: push" \\
          -d @$GITHUB_EVENT_PATH
`;

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      path: '.github/workflows/jules-maintainer.yml',
      message: 'ci: add jules-maintainer workflow',
      content: btoa(appendSignature(workflowContent, '.github/workflows/jules-maintainer.yml')),
    });
  }

  async run(): Promise<void> {
    const payload = RepoStandardizationPayloadSchema.parse(this.payload);

    try {
      await this.ensureJulesMaintainerWorkflow(payload);
      await RepositoryStandardization.enforce(
        this.env,
        {
          owner: { login: payload.repository.owner.login },
          name: payload.repository.name,
        },
        await this.getGitHubClient(),
      );

      await this.logExecution('success', 'Repository standardization completed.');
    } catch (error) {
      await this.logExecution(
        'failure',
        `Repository standardization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
