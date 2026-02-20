import { BaseAgent } from "./BaseAgent";
import { getDb } from "@db";
import { julesSessions, julesJobs } from "@/db/schemas/agents/jules";
import { alerts } from "@/db/schemas/app/alerts";
import { eq, notInArray, desc } from "drizzle-orm";
import { JulesService } from "@/services/jules";

type SessionCheckResult = {
  sessionId: string;
  status: string;
  actionTaken: string;
};

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
            let julesContext = null;

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
                        processOrigin: "JulesOverseer",
                        repoOrigin: job.repoFullName,
                        workerOrigin: "core-github-api",
                        isActionNeeded: true,
                        actionRequired: "Review generated Pull Request in GitHub"
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

    return results;
  }

  async scheduled(event: ScheduledEvent) {
    this.logger.info("Running scheduled check...");
    await this.checkJulesStatus();
  }

  /**
   * The AI Manager Logic
   * Leverages BaseAgent to automatically gain access to Cloudflare MCP.
   */
  private async evaluateStuckJules(julesContext: any): Promise<string> {
      const systemPrompt = `You are the Jules Overseer, an AI Engineering Manager overseeing an asynchronous coding agent named Jules.
Jules is currently working on the repository \`jmbish04/core-github-api\` but has become stuck and is waiting for your instructions.

YOUR DIRECTIVE:
1. Review Jules's current status and the error/roadblock they are facing.
2. Use your native Cloudflare MCP tools to query the official documentation if Jules is confused about Cloudflare-specific implementations (e.g., Workers, D1, KV, bindings).
3. Formulate a clear, authoritative, and step-by-step response to unblock Jules and guide it toward the correct implementation.
4. If Jules reports that the code is complete and asks for review/approval, explicitly instruct Jules to "Proceed to submit the Pull Request."`;

      const userPrompt = `Jules is stuck. Here is their current context and last message: \n${JSON.stringify(julesContext, null, 2)}`;

      try {
          // Utilizing the BaseAgent's built-in ReAct loop + MCP server mount
          const response = await this.runTextWithModel({
              name: "JulesOverseer",
              instructions: systemPrompt,
              prompt: userPrompt
          });
          
          return response;
      } catch (error) {
          this.logger.error("Failed to evaluate stuck Jules session", { error });
          return "Please review the files, consult standard Cloudflare Worker documentation, and try an alternative approach.";
      }
  }
}
