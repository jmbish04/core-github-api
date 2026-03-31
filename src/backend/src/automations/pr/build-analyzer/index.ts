import { z } from 'zod';
import { BaseAutomation, type AutomationMetadata } from '@/automations/core/BaseAutomation';
import { appendSignature } from '@/utils/github/signature';
import { prependColbyPrimer } from '@/automations/shared/colby/primer';
import { detectPRAuthorAgent } from '../../../utils/github/detectAgent';
import {
  formatBuildFailureComment,
  inferWorkerName,
} from './analysis';

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
    output: z.object({
       summary: z.string().optional(),
    }).optional(),
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
        issueComments: issueComments.data.map((comment: { body?: string | null }) => ({
          body: comment.body || '',
        })),
      });

      if (!agentInfo) {
        await this.logExecution('skipped', 'Unable to determine target coding agent.', prNumber);
        return;
      }

      const { getOctokitAsUser } = await import('@/services/github/client');
      const { WranglerInspectorService } = await import('@/services/github/wrangler-inspector');
      const { getCloudflareAccountId, getCloudflareApiToken } = await import('@/utils/secrets');
      const { BuildLogAnalyzer } = await import('@/services/cloudflare/build-logs');

      const logAnalyzer = new BuildLogAnalyzer(this.env);
      const summary = payload.check_run.output?.summary || '';
      const ids = logAnalyzer.extractBuildIdFromCheckRunSummary(summary);

      const accountId =
        typeof this.env.CLOUDFLARE_ACCOUNT_ID === 'string'
          ? this.env.CLOUDFLARE_ACCOUNT_ID
          : await getCloudflareAccountId(this.env);
      const cfToken =
        typeof this.env.CLOUDFLARE_API_TOKEN === 'string'
          ? this.env.CLOUDFLARE_API_TOKEN
          : await getCloudflareApiToken(this.env);

      const scriptName =
        (await (new WranglerInspectorService((await getOctokitAsUser(this.env)) as any).getWorkerName(payload.repository.owner.login, payload.repository.name))) ||
        ids?.scriptName ||
        inferWorkerName(
          payload.repository.full_name || `${payload.repository.owner.login}/${payload.repository.name}`,
        );

      let logs: string | null = null;
      if (ids && ids.buildUuid) {
        logs = await logAnalyzer.getBuildLogsByDeploymentId(accountId!, ids.buildUuid, cfToken!);
      }
      if (!logs) {
        logs = await logAnalyzer.getLatestBuildLogs(accountId!, scriptName, cfToken!);
      }

      if (!logs) {
        await this.logExecution('skipped', 'No Cloudflare deployment logs were available.', prNumber);
        return;
      }

      const octokitUser = await getOctokitAsUser(this.env);

      const buildUuidSig = `<!-- build-uuid: ${ids?.buildUuid || 'latest'} -->`;
      if (issueComments.data.some((c: any) => c.body?.includes(buildUuidSig))) {
        await this.logExecution(
          'skipped',
          `Already commented on build failure (UUID: ${ids?.buildUuid || 'latest'}).`,
          prNumber,
        );
        return;
      }

      const heuristics = await logAnalyzer.scanHeuristics(logs, cfToken!, accountId!, scriptName);
      const julesPrompt = await logAnalyzer.analyzeWithJules(logs);

      await octokitUser.rest.issues.createComment({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        issue_number: prNumber,
        body: appendSignature(
          prependColbyPrimer(
            formatBuildFailureComment(agentInfo.tag, prNumber, {
              julesPrompt,
              instructions: heuristics.instructions,
              docsContent: heuristics.docsContent,
              rawLogs: logs,
              buildUuid: ids?.buildUuid,
            }),
          ),
        ),
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
