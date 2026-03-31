/**
 * AI Pattern: Orchestrator-Workers
 * 
 * Implements a hierarchical delegation pattern where a 
 * central orchestrator breaks down a task into sub-tasks 
 * and distributes them to specialized worker agents.
 * 
 * @module AI/Agents/Base/Patterns/OrchestratorWorkers
 */
// Dynamic imports used instead of static
import { BaseAgent } from "@/ai/agents/base/BaseAgent";
import { callable } from "agents";
import { z } from "zod";

// --- Schemas ---
const TaskSchema = z.object({
  id: z.string(),
  workerType: z.enum(["researcher", "coder"]),
  instruction: z.string()
});

const PlanSchema = z.object({
  tasks: z.array(TaskSchema)
});

type OrchestratorState = {
  plan?: z.infer<typeof PlanSchema>;
  results: Record<string, string>;
};

/**
 * Definition of a task delegated to a worker.
 */
export interface WorkerTask {
  workerId: string;
  input: any;
  priority?: number;
}

// --- Agent Class ---
/**
 * Abstract class implementation of the Orchestrator-Workers pattern.
 */
export abstract class OrchestratorWorkersAgent extends BaseAgent<Env, OrchestratorState> {
  initialState: OrchestratorState = { results: {} };

  @callable()
  async processRequest(objective: string) {
    const { Agent, run, withTrace } = await import("@openai/agents");
    
    // 1. Planner Agent
    const planner = new Agent({
      name: "Planner",
      instructions: "Break the user request into smaller, distinct tasks.",
      outputType: PlanSchema
    });

    // 2. Worker Agents
    const researcher = new Agent({
      name: "Researcher",
      instructions: "You are a research assistant. Find information and summarize."
    });

    const coder = new Agent({
      name: "Coder",
      instructions: "You are a software engineer. Write code snippets based on instructions."
    });

    return await withTrace("Orchestrator Workflow", async () => {
      
      // Step 1: Create Plan
      const planResult = await run(planner, objective);
      const plan = planResult.finalOutput; // Corrected 'result' to 'planResult'
      this.ctx.storage.put("plan", plan);
      if (!plan) return "Failed to generate plan"; // Re-added the conditional check

      (this.state as any).plan = plan;

      // Step 2: Execute Workers
      const results: Record<string, string> = {};

      for (const task of plan.tasks) {
        console.log(`[Orchestrator] Executing task: ${task.id}`);
        
        let workerAgent;
        if (task.workerType === "researcher") workerAgent = researcher;
        else workerAgent = coder;

        // Run worker with context
        const result = await run(workerAgent, [
          { role: "system", content: `Context: ${objective}` },
          { role: "user", content: task.instruction }
        ]);

        const storedResults = (await this.ctx.storage.get("results") || {}) as Record<string, string>;
        storedResults[task.id] = result.finalOutput || "Error"; // Use task.id as key, not task.workerId
        this.ctx.storage.put("results", storedResults);
        results[task.id] = result.finalOutput || "Error"; // Keep local results for the return value
      }

      (this.state as any).results = results;
      return results;
    });
  }
}