import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/core/BaseAutomation';
import { appendSignature } from '@/utils/github/signature';
import { detectPRAuthorAgent } from './agent-tagging';
import {
  analyzeBuildFailure,
  fetchBuildLogs,
  formatBuildFailureComment,
  inferWorkerName,
} from './build-analysis';

const BuildAnalyzerPayloadSchema = z.object({
  action: z.string(),
  repository: z.object({
    name: z.string(),
    full_name: z.string().optional(),
    owner: z.object({
      login: z.string(),
    }),
  }),
  check_run: z.object({
    name: z.string().optional(),
    conclusion: z.string().nullable().optional(),
    app: z
      .object({
        name: z.string().optional(),
      })
      .optional(),
    pull_requests: z
      .array(
        z.object({
          number: z.number().optional(),
        }),
      )
      .default([]),
  }),
});

type BuildAnalyzerPayload = z.infer<typeof BuildAnalyzerPayloadSchema>;

export class BuildAnalyzer extends BaseAutomation<BuildAnalyzerPayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'build-analyzer',
    domain: 'pr',
    description: 'Posts an agent-targeted fix prompt when a Cloudflare build check fails.',
    events: ['check_run'],
    alwaysOn: false,
    authPolicy: 'pat',
  };

  async shouldRun(): Promise<boolean> {
    if (this.eventName !== 'check_run' || this.action !== 'completed') {
      return false;
    }

    const parsed = BuildAnalyzerPayloadSchema.safeParse(this.payload);
    if (!parsed.success || parsed.data.check_run.conclusion !== 'failure') {
      return false;
    }

    const checkName = (parsed.data.check_run.name || '').toLowerCase();
    const appName = (parsed.data.check_run.app?.name || '').toLowerCase();
    return (
      checkName.includes('cloudflare') ||
      checkName.includes('deploy') ||
      checkName.includes('wrangler') ||
      appName.includes('cloudflare') ||
      appName.includes('workers')
    );
  }

  async run(): Promise<void> {
    const payload = BuildAnalyzerPayloadSchema.parse(this.payload);
    const prNumber = payload.check_run.pull_requests[0]?.number;

    if (!prNumber) {
      await this.logExecution('skipped', 'Failed check run is not attached to a pull request.');
      return;
    }

    try {
      const octokit = await this.getGitHubClient();

      const pr = await octokit.rest.pulls.get({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: prNumber,
      });

      const issueComments = await octokit.rest.issues.listComments({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: prNumber,
        per_page: 100,
      });

      const agentInfo = detectPRAuthorAgent({
        headRef: pr.data.head?.ref,
        body: pr.data.body,
        authorLogin: pr.data.user?.login,
        authorHtmlUrl: pr.data.user?.html_url,
        issueComments: issueComments.data.map((comment) => ({
          body: comment.body || '',
        })),
      });

      if (!agentInfo) {
        await this.logExecution('skipped', 'Unable to determine target coding agent.', prNumber);
        return;
      }

      const workerName = inferWorkerName(
        payload.repository.full_name || `${payload.repository.owner.login}/${payload.repository.name}`,
      );
      const logs = await fetchBuildLogs(this.env, workerName);
      if (!logs) {
        await this.logExecution('skipped', 'No Cloudflare deployment logs were available.', prNumber);
        return;
      }

      const analysis = await analyzeBuildFailure(this.env, logs, {
        prNumber,
        prTitle: pr.data.title,
        headRef: pr.data.head?.ref || '',
        repoFullName:
          payload.repository.full_name ||
          `${payload.repository.owner.login}/${payload.repository.name}`,
      });

      await octokit.rest.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: prNumber,
        body: appendSignature(formatBuildFailureComment(agentInfo.tag, prNumber, analysis)),
      });

      await this.logExecution('success', 'Posted build failure analysis via PAT identity.', prNumber);
    } catch (error) {
      await this.logExecution(
        'failure',
        `Build analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        prNumber,
      );
      throw error;
    }
  }
}
