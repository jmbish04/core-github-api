/**
 * Planner Agent (Strategy & Step Generation)
 * 
 * Specialized agent responsible for breaking down a high-level goal 
 * into a structured, execution-ready implementation plan.
 * 
 * @module AI/Agents/Planner
 */
import { callable } from "agents";
import type { Agent } from "@openai/agents";
import { z } from "zod";
import { resolveDefaultAiModel, resolveDefaultAiProvider } from "@/ai/providers/config";
import { BaseAgent, BaseAgentState } from "@/ai/agents/base/BaseAgent";
import { Logger } from "@logging";

const PlanSchema = z.object({
  title: z.string().describe("The comprehensive title of the plan"),
  steps: z.array(
    z.object({
      id: z.string().describe("Unique identifier for the step (e.g., step-1)"),
      description: z.string().describe("Detailed description of what needs to be done"),
      difficulty: z.enum(["easy", "medium", "hard"]).describe("Estimated difficulty level"),
      command: z.string().optional().describe("CLI command provided if applicable"),
    }),
  ),
});

/**
 * The PlannerAgent generates structured step-by-step implementation plans.
 */
export class PlannerAgent extends BaseAgent<Env, BaseAgentState> {


  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  @callable()
  healthProbe() {
    return {
      status: "ok",
      agent: "PlannerAgent",
      timestamp: new Date().toISOString(),
    };
  }

/**
 * Handles incoming planning requests.
 * Parses the goal and invokes the LLM to generate a structured plan.
 */
  async onRequest(request: Request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health-probe") {
      return Response.json(this.healthProbe());
    }

    let goal = "";
    try {
      const body = (await request.json()) as { goal: string };
      goal = body.goal;
    } catch {
      return new Response("Invalid request body", { status: 400 });
    }

    if (!goal.trim()) {
      return new Response("Goal is required", { status: 400 });
    }

    try {
      const provider = resolveDefaultAiProvider(this.env);
      const model = resolveDefaultAiModel(this.env, provider);
      
      this.logger.info("Generating plan", { goalLength: goal.length, provider, model });

      const result = await this.runStructuredResponseWithModel({
        name: "PlannerAgent",
        model,
        provider,
        schema: PlanSchema,
        instructions:
          "Create an implementation plan for the user goal. Return a concise, execution-ready plan.",
        prompt: goal,
      });

      return Response.json(result ?? { title: "Plan", steps: [] });
    } catch (error: any) {
      this.logger.error("Planning failed", { error: error.message });
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  }
}
