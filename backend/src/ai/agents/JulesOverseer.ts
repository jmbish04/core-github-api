/**
 * Jules Overseer Agent (Asynchronous Agent Manager)
 * 
 * Monitors the lifecycle of long-running Jules (coding agent) sessions.
 * 1. Detects sessions inactive or stuck waiting for user input.
 * 2. Uses AI reasoning to evaluate the stuck state and provide autonomous guidance.
 * 3. Notifies humans of completed tasks or critical blockers via the Alerts system.
 * 4. Automatically triggers unblocking messages using the MCP-enabled BaseAgent foundation.
 * 
 * @module AI/Agents/JulesOverseer
 */
import { BaseAgent } from "./base/BaseAgent";
import { getDb } from "@db";
import { julesSessions, julesJobs } from "@db/schemas/jules";
import { alerts } from "@/db/schemas/app/alerts";
import { eq, notInArray, desc } from "drizzle-orm";
import { JulesService } from "@services/jules";
import { z } from "zod";

type SessionCheckResult = {
  sessionId: string;
  status: string;
  actionTaken: string;
};

/**
 * The JulesOverseer ensures autonomous progress for the Jules coding subsystem.
 */
export class JulesOverseer extends BaseAgent {
  // Check for sessions inactive for more than 1 hour
  private static STUCK_THRESHOLD_MS = 60 * 60 * 1000; 

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === '/schedule/check') {
          await this.checkJulesStatus();
          return new Response('OK');
      }
      return super.fetch(request);
  }

  override async onStart() {
      // Setup background check every hour using the SDK scheduling
      await this.schedule(60 * 60, "checkJulesStatus");
  }

/**
 * Core monitoring loop. Scans the database for active jobs and 
 * inspects their status in the Jules service.
 */
  async checkJulesStatus(args?: any): Promise<SessionCheckResult[]> {
    const db = getDb(this.env.DB);
    const julesService = JulesService.getInstance(this.env);
    const results: SessionCheckResult[] = [];

    // 1. Find Pending/Blocked Jobs
    const activeJobs = await db.select()
      .from(julesJobs)
      .where(notInArray(julesJobs.status, ['completed', 'failed']))
      .orderBy(desc(julesJobs.createdAt))
      .limit(20);

    this.logger.info(`Checking ${activeJobs.length} active jobs`);

    for (const job of activeJobs) {
        try {
            const session = await julesService.getSession(job.sessionId);
            
            let status = 'unknown';
            let julesContext: any = null;

            try {
                // Fetch the status and history/info from Jules
                const info = await session.info();
                status = info.state || 'running';
                julesContext = info || 'No context available'; 
            } catch (e) {
                status = 'running';
            }

            if (status === 'completed' || status === 'failed' || status === 'ready_for_pr') {
                if (status === 'ready_for_pr' || status === 'completed') {
                    // Tell Jules to wrap up
                    await julesService.sendMessage(job.sessionId, "The changes look good. Please proceed to submit the Pull Request.");
                    
                    // Fire an Alert for human follow-up
                    await db.insert(alerts).values({
                        id: crypto.randomUUID(),
                        title: "Jules Remediation Completed",
                        description: `Jules has finished the assigned task and submitted a PR for session ${job.sessionId}. Human review of the PR is recommended.`,
                        process_origin: "JulesOverseer",
                        repo_origin: job.repoFullName,
                        worker_origin: "core-github-api",
                        is_action_needed: true,
                        action_required: "Review generated Pull Request in GitHub"
                    });
                }

                await db.update(julesJobs)
                    .set({ status: 'completed' })
                    .where(eq(julesJobs.id, job.id));
                await db.update(julesSessions)
                    .set({ status: 'completed' })
                    .where(eq(julesSessions.id, job.sessionId));

                results.push({ sessionId: job.sessionId, status, actionTaken: 'marked_completed' });

            } else if (status === 'waiting_for_user') {
                 this.logger.info(`Session ${job.sessionId} is stuck. Booting AI Manager...`);
                 
                 // Update job to blocked so UI reflects it
                 if (job.status !== 'blocked') {
                     await db.update(julesJobs)
                        .set({ status: 'blocked' })
                        .where(eq(julesJobs.id, job.id));
                 }

                 // Run AI Manager to unblock Jules utilizing BaseAgent's native MCP integration
                 const instructions = await this.evaluateStuckJules(julesContext);
                 
                 // Send the unblocking instructions back to Jules
                 await julesService.sendMessage(job.sessionId, instructions);

                 results.push({ sessionId: job.sessionId, status, actionTaken: 'unblocked_via_ai' });
            } else {
                 results.push({ sessionId: job.sessionId, status, actionTaken: 'monitoring' });
            }

        } catch (err: any) {
            this.logger.error(`Failed to inspect job ${job.id}`, { error: err.message });
            results.push({ sessionId: job.sessionId, status: 'error', actionTaken: 'error' });
        }
    }

    // Schedule the next check
    await this.schedule(60 * 60, "checkJulesStatus");

    return results;
  }

  /**
   * The AI Manager Logic
   * Leverages BaseAgent to automatically gain access to Cloudflare MCP.
   */
/**
 * AI-powered stuck session evaluator.
 * Leverages high-reasoning models and MCP tools to understand why 
 * a session is stuck and generate authoritative remediation instructions.
 */
  private async evaluateStuckJules(julesContext: any): Promise<string> {
      const systemPrompt = `You are the Jules Overseer, an AI Engineering Manager overseeing an asynchronous coding agent named Jules.
Jules is currently working on the repository \`jmbish04/core-github-api\` but has become stuck and is waiting for your instructions.

YOUR DIRECTIVE:
1. Review Jules's current status and the error/roadblock they are facing.
2. If Jules is confused about Cloudflare-specific implementations (e.g., Workers, D1, KV, bindings), provide authoritative guidance.
3. Formulate a clear, authoritative, and step-by-step response to unblock Jules and guide it toward the correct implementation.
4. If Jules reports that the code is complete and asks for review/approval, explicitly instruct Jules to "Proceed to submit the Pull Request."`;

      const userPrompt = `Jules is stuck. Here is their current context and last message: \n${JSON.stringify(julesContext, null, 2)}`;

      try {
          const julesService = JulesService.getInstance(this.env);
          const provider = this.resolveProvider();
          const model = this.resolveModel(provider);

          return await this.runTextWithModel({
              name: "JulesOverseer",
              instructions: systemPrompt,
              prompt: userPrompt,
              provider,
              model,
              tools: [
                  {
                      name: "get_session_info",
                      description: "Get detailed information about a Jules session to understand why it is stuck.",
                      parameters: z.object({ sessionId: z.string() }) as any,
                      execute: async ({ sessionId }: { sessionId: string }) => {
                          try {
                              const session = await julesService.getSession(sessionId);
                              return await session.info();
                          } catch (e: any) {
                              return { error: e.message };
                          }
                      }
                  },
                  {
                      name: "get_session_snapshot",
                      description: "Get a point-in-time snapshot of the session including the full filesystem state and history.",
                      parameters: z.object({ sessionId: z.string() }) as any,
                      execute: async ({ sessionId }: { sessionId: string }) => {
                          try {
                              return await julesService.getSessionSnapshot(sessionId, { includeActivities: false });
                          } catch (e: any) {
                              return { error: e.message };
                          }
                      }
                  }
              ]
          });
      } catch (error) {
          this.logger.error("Failed to evaluate stuck Jules session", { error });
          return "Please review the files, consult standard Cloudflare Worker documentation, and try an alternative approach.";
      }
  }
}
