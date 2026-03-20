import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { BaseAutomation, type AutomationMetadata } from '@/automations/core/BaseAutomation';
import { getDb } from '@db';
import { repoStats, repos } from '@db/schema';

const StatsUpdatePayloadSchema = z.object({
  repository: z.object({
    name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
});

type StatsUpdatePayload = z.infer<typeof StatsUpdatePayloadSchema>;

function calculateHealthScore(openIssues: number, mergedPRs: number): number {
  let score = 100;
  if (openIssues > 50) score -= 20;
  if (openIssues > 20) score -= 10;
  if (mergedPRs > 5) score += 10;
  return Math.min(Math.max(score, 0), 100);
}

export class StatsUpdate extends BaseAutomation<StatsUpdatePayload> {
  static readonly metadata: AutomationMetadata = {
    key: 'stats-update',
    domain: 'repository',
    description: 'Refreshes repository health metrics from GitHub activity.',
    events: ['repository', 'push', 'pull_request', 'issues', 'issue_comment', 'check_run'],
    alwaysOn: true,
    authPolicy: 'app',
  };

  async shouldRun(): Promise<boolean> {
    return StatsUpdatePayloadSchema.safeParse(this.payload).success;
  }

  async run(): Promise<void> {
    const payload = StatsUpdatePayloadSchema.parse(this.payload);
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;

    try {
      const db = getDb(this.env.DB);
      const octokit = await this.getGitHubClient();

      const repoRecord = await db
        .select()
        .from(repos)
        .where(and(eq(repos.owner, owner), eq(repos.name, repo)))
        .limit(1);

      if (!repoRecord.length) {
        await this.logExecution('skipped', 'Repository metrics skipped because repo is not tracked.');
        return;
      }

      const repository = await octokit.rest.repos.get({ owner, repo });
      const pulls = await octokit.rest.pulls.list({
        owner,
        repo,
        state: 'closed',
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
      });

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const mergedPRs = pulls.data.filter(
        (pull) => pull.merged_at && new Date(pull.merged_at) > oneWeekAgo,
      );

      const healthScore = calculateHealthScore(
        repository.data.open_issues_count,
        mergedPRs.length,
      );

      const existingStats = await db
        .select()
        .from(repoStats)
        .where(eq(repoStats.repoId, repoRecord[0].id))
        .limit(1);

      if (existingStats.length) {
        await db
          .update(repoStats)
          .set({
            healthScore,
            openIssuesCount: repository.data.open_issues_count,
            prsMergedThisWeek: mergedPRs.length,
            lastUpdated: new Date().toISOString(),
          })
          .where(eq(repoStats.repoId, repoRecord[0].id));
      } else {
        await db.insert(repoStats).values({
          repoId: repoRecord[0].id,
          healthScore,
          openIssuesCount: repository.data.open_issues_count,
          prsMergedThisWeek: mergedPRs.length,
          lastUpdated: new Date().toISOString(),
        });
      }

      await this.logExecution('success', 'Updated repository health metrics.');
    } catch (error) {
      await this.logExecution(
        'failure',
        `Stats update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
