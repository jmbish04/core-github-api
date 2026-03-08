import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/core/BaseAutomation';
import { generateDocstringsForProject } from './docstring_generator/service';

const DocstringGeneratorPayloadSchema = z.object({
  action: z.string(),
  repository: z.object({
    name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
  pull_request: z.object({
    number: z.number(),
    draft: z.boolean().optional(),
  }),
});

type DocstringGeneratorPayload = z.infer<typeof DocstringGeneratorPayloadSchema>;

export class DocstringGenerator extends BaseAutomation<DocstringGeneratorPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'docstring-generator',
    domain: 'pr',
    description: 'Creates a follow-up PR with AI-generated docstrings for changed source files.',
    events: ['pull_request'],
    alwaysOn: false,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName !== 'pull_request') {
      return false;
    }

    const parsed = DocstringGeneratorPayloadSchema.safeParse(this.payload);
    if (!parsed.success) {
      return false;
    }

    if (parsed.data.pull_request.draft) {
      return false;
    }

    return this.action === 'opened' || this.action === 'synchronize';
  }

  async run(): Promise<void> {
    const payload = DocstringGeneratorPayloadSchema.parse(this.payload);
    const prNumber = payload.pull_request.number;

    try {
      const octokit = await this.getGitHubClient();
      const files = await octokit.rest.pulls.listFiles({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: prNumber,
        per_page: 100,
      });

      const candidateFiles = files.data
        .map((file) => file.filename)
        .filter((filename): filename is string => Boolean(filename))
        .filter((filename) => /\.(ts|tsx|js|jsx)$/.test(filename));

      if (!candidateFiles.length) {
        await this.logExecution('skipped', 'No source files eligible for docstring generation.', prNumber);
        return;
      }

      const result = await generateDocstringsForProject(
        this.env,
        payload.repository.owner.login,
        payload.repository.name,
        candidateFiles,
        octokit,
      );

      await this.logExecution(
        'success',
        `Generated docstring PR on branch ${result.branchName}.`,
        prNumber,
      );
    } catch (error) {
      await this.logExecution(
        'failure',
        `Docstring generation failed: ${error instanceof Error ? error.message : String(error)}`,
        prNumber,
      );
      throw error;
    }
  }
}
