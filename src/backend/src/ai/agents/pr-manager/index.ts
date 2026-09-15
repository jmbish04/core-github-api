import { Agent, type AgentContext } from 'agents';
import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import { migrateAgentDb } from '@/db/schemas/agents/stateful';

const MyOctokit = Octokit.plugin(retry, throttling);

export class PrManagerAgent extends Agent<Env> {
  private octokit: InstanceType<typeof MyOctokit>;

  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
    this.octokit = new MyOctokit({
      auth: this.env.GITHUB_TOKEN,
      throttle: {
        onRateLimit: (retryAfter: number, options: any) => {
          this.logger.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
          if (options.request.retryCount === 0) {
            this.logger.info(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
        onSecondaryRateLimit: (retryAfter: number, options: any) => {
          this.logger.warn(`SecondaryRateLimit detected for request ${options.method} ${options.url}`);
          return true;
        },
      },
    });
  }

  async onStart() {
    await super.onStart();
    await this.ctx.blockConcurrencyWhile(async () => {
      migrateAgentDb(this.ctx.storage);
    });

    // Schedule cron idempotently as per SDK 0.8.0
    await this.schedule("*/15 * * * *", "process_prs", undefined, { idempotent: true });
  }

  async process_prs() {
    this.logger.info("Running scheduled PR processing...");

    // Default to the org repo if GITHUB_OWNER/REPO are not specified, or just fallback to some default
    const owner = this.env.GITHUB_OWNER || 'cloudflare';
    const repo = this.env.GITHUB_REPO || 'core-github-api';

    try {
      const prs = await this.octokit.pulls.list({
        owner,
        repo,
        state: 'open',
      });

      for (const pr of prs.data) {
        try {
          const prDetails = await this.octokit.pulls.get({
            owner,
            repo,
            pull_number: pr.number,
          });

          if (prDetails.data.mergeable === false) {
            // Check if there are conflicts
            const hasConflict = prDetails.data.mergeable_state === 'dirty';
            if (hasConflict) {

              // Attempt to auto resolve
              const diff = await this.octokit.pulls.get({
                  owner,
                  repo,
                  pull_number: pr.number,
                  mediaType: {
                      format: "diff"
                  }
              });

              // Basic heuristic - if the diff contains standard git conflict markers (usually shouldn't happen via API diff, but we simulate some basic heuristic here)
              const diffText = diff.data as unknown as string;

              // We'll simulate a low confidence check. If we can't safely resolve, we abort and comment.
              // In this case, we always assume low confidence for any dirty state to be safe.
              const lowConfidence = true;

              if (lowConfidence) {
                  await this.octokit.issues.createComment({
                    owner,
                    repo,
                    issue_number: pr.number,
                    body: "I am unable to confidently resolve these conflicts automatically. Manual intervention is required.",
                  });

                  this.ctx.storage.sql.exec(
                    `INSERT INTO pr_jobs (id, owner, repo, pr_number, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
                    crypto.randomUUID(), owner, repo, pr.number, 'conflict', new Date().toISOString()
                  );
              }
            }
          } else if (prDetails.data.mergeable === true) {
            // Attempt to merge
            await this.octokit.pulls.merge({
              owner,
              repo,
              pull_number: pr.number,
            });
            this.ctx.storage.sql.exec(
              `INSERT INTO pr_jobs (id, owner, repo, pr_number, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
              crypto.randomUUID(), owner, repo, pr.number, 'merged', new Date().toISOString()
            );
          }
        } catch (e: any) {
          this.logger.error(`Failed processing PR ${pr.number}: ${e.message}`);
          this.ctx.storage.sql.exec(
            `INSERT INTO pr_jobs (id, owner, repo, pr_number, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
            crypto.randomUUID(), owner, repo, pr.number, 'error', new Date().toISOString()
          );
        }
      }
    } catch (e: any) {
      this.logger.error("Failed to list PRs: " + e.message);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/scheduled') {
      // Manual trigger for the worker
      await this.process_prs();
      return new Response("OK");
    }

    if (url.pathname === '/api/jobs') {
      try {
        const result = Array.from(this.ctx.storage.sql.exec(`SELECT * FROM pr_jobs ORDER BY created_at DESC LIMIT 100`));
        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        // Table might not exist yet if onStart didn't run
        if (e.message.includes('no such table')) {
          return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }

    return super.fetch(request);
  }
}
