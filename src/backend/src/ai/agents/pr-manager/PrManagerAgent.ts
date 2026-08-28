import { Agent } from "agents";
import { Octokit } from "@octokit/rest";
import { getAgentDb, migrateAgentDb } from "@/db/schemas/agents/stateful";
import { prManagerJobs } from "@/db/schemas/agents/events";
import { Logger } from "@/lib/logger";
import { setupOpenAIAgentClient, getJulesClient } from "../../providers";

export class PrManagerAgent extends Agent<Env> {
  private logger: Logger;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.logger = new Logger(env, "pr_manager_agent");
  }

  async onStart() {
    await this.ctx.blockConcurrencyWhile(async () => {
      migrateAgentDb(this.ctx.storage);
    });

    await this.schedule("*/15 * * * *", "processPendingPrs", undefined, { idempotent: true });
  }

  async processPendingPrs() {
    this.logger.info("Starting processPendingPrs cron job");

    try {
      const token = typeof this.env.GITHUB_TOKEN === 'string'
        ? this.env.GITHUB_TOKEN
        : await (this.env as any).GITHUB_TOKEN?.get?.();

      if (!token) {
        throw new Error("GITHUB_TOKEN is not set");
      }

      const octokit = new Octokit({ auth: token });
      const db = getAgentDb(this.ctx.storage);

      const owner = "jmbish04";
      const repo = "testing-oktokit-commands";

      const { data: prs } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: "open"
      });

      for (const pr of prs) {
        const { data: detailedPr } = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: pr.number
        });

        if (detailedPr.mergeable === false) {
          this.logger.info(`Merge conflict detected for PR #${pr.number}`);

          // Attempt resolution with Jules
          let resolved = false;
          try {
            const julesClient = await getJulesClient(this.env);
            await setupOpenAIAgentClient(this.env, "workers-ai");

            const session = await julesClient.session({
              title: `Resolve Conflict: ${owner}/${repo}#${pr.number}`,
              prompt: `Resolve the merge conflicts in pull request #${pr.number} in ${owner}/${repo}. Create a plan, apply diffs to resolve conflicts, and commit. Do not merge yet.`,
              source: { github: `${owner}/${repo}`, baseBranch: pr.head.ref },
              requireApproval: false,
              autoPr: false
            });

            let isTerminal = false;
            let finalOutcome: any | null = null;
            while (!isTerminal) {
                const info = await session.info();
                if (info.state === 'completed' || info.state === 'failed') {
                    finalOutcome = info.outcome!;
                    isTerminal = true;
                    if(info.state === 'completed') resolved = true;
                    break;
                }
                if (info.state === 'awaitingPlanApproval') {
                    await session.approve();
                }
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
          } catch(e) {
              this.logger.error("Jules resolution failed", {error: e});
          }

          if (!resolved) {
            await octokit.rest.issues.createComment({
              owner,
              repo,
              issue_number: pr.number,
              body: "I am unable to confidently resolve these conflicts automatically. Manual intervention is required."
            });

            await db.insert(prManagerJobs).values({
              id: crypto.randomUUID(),
              owner,
              repo,
              pullNumber: pr.number.toString(),
              status: "conflict_reported"
            }).onConflictDoUpdate({
              target: [prManagerJobs.id],
              set: { status: "conflict_reported" }
            });
          } else {
             await db.insert(prManagerJobs).values({
              id: crypto.randomUUID(),
              owner,
              repo,
              pullNumber: pr.number.toString(),
              status: "conflict_resolved"
            }).onConflictDoUpdate({
              target: [prManagerJobs.id],
              set: { status: "conflict_resolved" }
            });
          }

        } else if (detailedPr.mergeable === true) {
          this.logger.info(`PR #${pr.number} is mergeable, attempting merge...`);
          try {
            await octokit.rest.pulls.merge({
              owner,
              repo,
              pull_number: pr.number
            });
            await db.insert(prManagerJobs).values({
              id: crypto.randomUUID(),
              owner,
              repo,
              pullNumber: pr.number.toString(),
              status: "merged"
            }).onConflictDoUpdate({
              target: [prManagerJobs.id],
              set: { status: "merged" }
            });
          } catch (mergeError: any) {
            this.logger.error(`Merge failed for PR #${pr.number}`, { error: mergeError.message });
            await db.insert(prManagerJobs).values({
              id: crypto.randomUUID(),
              owner,
              repo,
              pullNumber: pr.number.toString(),
              status: "merge_failed"
            }).onConflictDoUpdate({
              target: [prManagerJobs.id],
              set: { status: "merge_failed" }
            });
          }
        }
      }
    } catch (error: any) {
      this.logger.error("Error in processPendingPrs", { error: error.message });
    } finally {
      await this.logger.flush();
    }
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/jobs') {
      const db = getAgentDb(this.ctx.storage);
      const jobs = await db.select().from(prManagerJobs);
      return new Response(JSON.stringify(jobs), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/scheduled') {
      await this.processPendingPrs();
      return new Response('Scheduled task triggered');
    }
    return super.fetch(request);
  }
}
