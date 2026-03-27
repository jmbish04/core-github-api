import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/automations/core/BaseAutomation';
import { JulesSessionBuilder } from '@/services/jules/builder';
import { buildRepositorySpecialistAssets } from '@/automations/repository/standardization/specialist';

const PullRequestEventPayloadSchema = z.object({
  action: z.string(),
  repository: z.object({
    name: z.string(),
    description: z.string().nullable().optional(),
    owner: z.object({
      login: z.string(),
    }),
  }),
  pull_request: z.object({
    number: z.number(),
    head: z.object({
      ref: z.string(),
    }),
  }),
});

type JulesAgentSyncPayload = z.infer<typeof PullRequestEventPayloadSchema>;

export class JulesAgentSync extends BaseAutomation<JulesAgentSyncPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'jules-agent-sync',
    domain: 'pr',
    description: 'Deploys Jules AI on pull requests to continuously analyze changes and sync AGENTS.md / rules against golden standard scaffolds.',
    events: ['pull_request'],
    alwaysOn: false,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName === 'pull_request') {
      const parsed = PullRequestEventPayloadSchema.safeParse(this.payload);
      if (parsed.success) {
        // Only run on opened or synchronize actions
        return parsed.data.action === 'opened' || parsed.data.action === 'synchronize';
      }
    }
    return false;
  }

  async run(): Promise<void> {
    try {
      const payload = PullRequestEventPayloadSchema.parse(this.payload);
      const pr = payload.pull_request;
      const repo = payload.repository;

      // We pull the golden standards from the same utility the sync loop used to use,
      // but instead of pushing them as static files, we inject them into Jules' prompt
      // as instructions so Jules can intelligently merge them with the existing repo contents.
      const tailoredAssets = await buildRepositorySpecialistAssets(
        this.env,
        repo.name,
        repo.description || null,
      );

      const promptStr = `
You are tasked with reviewing the repository codebase (especially the main branch and the changes introduced in this PR) and optimizing the agentic assets.

Your primary goals are:
1. Ensure the \`AGENTS.md\` file accurately reflects the current state of the architecture and includes the required golden standards.
2. Maintain or create \`.agent/rules/\` markdown files based on any observed patterns in the repository that Copilot or other agents should follow.
3. Update or create \`.github/agents/repo-specialist.agent.md\` with scaffolding instructions specific to this repository to prevent other agents from going off-track.

### Golden Standards to enforce

You must ensure these golden standards are baked into the respective files.

**AGENTS.md baseline instructions:**
\`\`\`markdown
${tailoredAssets.agentsGuideMarkdown}
\`\`\`

**repo-specialist.agent.md baseline instructions:**
\`\`\`markdown
${tailoredAssets.repoSpecialistMarkdown}
\`\`\`

Analyze the code. Edit the files. Remember, you have full control over the file system on this PR branch.
      `.trim();

      await new JulesSessionBuilder(this.env)
        .withPrompt(promptStr)
        .withRepo(repo.owner.login, repo.name, pr.head.ref)
        .withAgentId('core-agent')
        .withoutAutoPr()
        .withoutApproval()
        .start();

      await this.logExecution('success', 'Spawned Jules Agent Sync session.', pr.number);
    } catch (error) {
      await this.logExecution(
        'failure',
        `Jules Agent Sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
