import { Agent, run, withTrace } from "@openai/agents";
import { Agent as CFAgent, callable } from "agents";
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

// --- Agent Class ---
export class OrchestratorAgent extends CFAgent<Env, OrchestratorState> {
  initialState: OrchestratorState = { results: {} };

  // 1. Planner Agent
  planner = new Agent({
    name: "Planner",
    instructions: "Break the user request into smaller, distinct tasks.",
    outputType: PlanSchema
  });

  // 2. Worker Agents
  researcher = new Agent({
    name: "Researcher",
    instructions: "You are a research assistant. Find information and summarize."
  });

  coder = new Agent({
    name: "Coder",
    instructions: "You are a software engineer. Write code snippets based on instructions."
  });

  @callable()
  async processRequest(objective: string) {
    return await withTrace("Orchestrator Workflow", async () => {
      
      // Step 1: Create Plan
      const planResult = await run(this.planner, objective);
      const plan = planResult.finalOutput;

      if (!plan) return "Failed to generate plan";

      this.setState({ ...this.state, plan });

      // Step 2: Execute Workers
      const results: Record<string, string> = {};

      for (const task of plan.tasks) {
        console.log(`[Orchestrator] Executing task: ${task.id}`);
        
        let workerAgent;
        if (task.workerType === "researcher") workerAgent = this.researcher;
        else workerAgent = this.coder;

        // Run worker with context
        const result = await run(workerAgent, [
          { role: "system", content: `Context: ${objective}` },
          { role: "user", content: task.instruction }
        ]);

        results[task.id] = result.finalOutput || "Error";
      }

      this.setState({ ...this.state, results });
      return results;
    });
  }
}