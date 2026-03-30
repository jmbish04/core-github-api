/**
 * src/backend/src/ai/agents/pr-reviewer/JulesPrReviewer.ts
 * * End-to-end Honi Agent implementing the Jules Orchestrator pattern.
 * Replaces legacy PRSupervisor, PRReview, and PRSummary agents.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { 
  createAgent, 
  routeToAgent 
} from '../honi';
import { Agent, run } from '@openai/agents';
import { setupOpenAIAgentClient, getJulesClient } from '../../providers';

// Validation schema for incoming GitHub Webhook PR payloads
const PrReviewTaskSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  pullNumber: z.number(),
  title: z.string().optional(),
  branch: z.string().default("main")
});

// Relying on global Env for Cloudflare Workers

/**
 * JulesPrReviewer Agent
 * Acts as the "Overseer" for a Jules coding session focused on PR review.
 */
const runtime = createAgent<Env>({
  name: "JulesPrReviewer",
  description: "Autonomous Jules orchestrator for GitHub Pull Request reviews.",

  async onTask(task: z.infer<typeof PrReviewTaskSchema>, { env, ctx: _ctx }: { env: Env, ctx: any }) {
    // 1. Initialize Jules SDK via Centralized Provider
    const julesClient = await getJulesClient(env);

    // 2. Initialize reasoning brain via Cloudflare AI Gateway & OpenAI Agents SDK -- using WorkersAI gpt-oss-120b
    await setupOpenAIAgentClient(env, "workers-ai");

    const overseer = new Agent({
      name: "Overseer",
      instructions: "You are a Senior Architect overseeing a code review agent. Provide direct guidance to ensure high-quality, bug-free code.",
      model: "workers-ai/@cf/openai/gpt-oss-120b",
    });

    console.log(`[JulesPrReviewer] Orchestrating review for ${task.owner}/${task.repo}#${task.pullNumber}`);

    // 3. Create interactive Jules Session
    // We use a custom prompt to instruct Jules to perform a review and leave comments.
    const session = await julesClient.session({
      title: `PR Review: ${task.owner}/${task.repo}#${task.pullNumber}`,
      prompt: `Review pull request #${task.pullNumber} in ${task.owner}/${task.repo}. 
               Analyze the diff, find bugs or optimizations, and create line-specific review comments. 
               Submit a final summary review when finished.`,
      source: {
        github: `${task.owner}/${task.repo}`,
        baseBranch: task.branch
      },
      requireApproval: false, // We will auto-approve the plan
      autoPr: false // No new PR needed, we are reviewing an existing one
    });

    // 4. Autonomous Oversight Loop
    let isTerminal = false;
    let finalOutcome: any | null = null;
    let lastProcessedActivityId: string | null = null;

    while (!isTerminal) {
      const info = await session.info();
      const state = info.state;

      // Check for terminal states
      if (state === 'completed' || state === 'failed') {
        finalOutcome = info.outcome!;
        isTerminal = true;
        break;
      }

      // Logic Rule: If Jules creates a plan, approve it immediately
      if (state === 'awaitingPlanApproval') {
        console.log(`[JulesPrReviewer] Auto-approving review plan for ${session.id}`);
        await session.approve();
      }

      // Logic Rule: If Jules gets stuck or asks for guidance, provide it
      const activities = await session.activities.select({ limit: 1 });
      const lastActivity = activities[0];

      if (
        lastActivity && 
        lastActivity.id !== lastProcessedActivityId && 
        lastActivity.type === 'agentMessaged' && 
        lastActivity.originator === 'agent'
      ) {
        console.log(`[JulesPrReviewer] Providing guidance for message: ${lastActivity.message}`);
        
        const guidanceResult = await run(overseer, `Review context: ${task.title}. Agent asks: ${lastActivity.message}`);
        const reply = (typeof guidanceResult.finalOutput === 'string' ? guidanceResult.finalOutput : JSON.stringify(guidanceResult.finalOutput)) || "Proceed with standard best practices.";
        await session.send(reply);
        lastProcessedActivityId = lastActivity.id;
      }

      // Backpressure: Wait 10s between polls to respect API rates
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    return {
      status: finalOutcome?.state,
      commentsCount: finalOutcome?.summary?.length || 0,
      summary: "PR Review completed via autonomous Jules orchestration."
    };
  }
});

export class JulesPrReviewer extends runtime.Agent {}

// Hono Interface
const app = new Hono<{ Bindings: Env }>();

app.post('/review', zValidator('json', PrReviewTaskSchema), async (c) => {
  const task = c.req.valid('json');
  const result = await routeToAgent(c.env as any, { binding: 'JULES_PR_REVIEWER' }, JSON.stringify(task));
  return c.json(result);
});

app.get('/health', (c) => c.json({ status: "healthy", timestamp: new Date().toISOString() }));
app.get('/context', (c) => c.json({ pattern: "honi-jules-orchestrator", target: "pr-reviewer" }));

export default app;
