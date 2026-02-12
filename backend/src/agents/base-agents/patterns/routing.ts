import { Agent, run } from "@openai/agents";
import { Agent as CFAgent, callable } from "agents";
import { z } from "zod";

const RouteSchema = z.object({
  category: z.enum(["billing", "technical", "general"]),
  reasoning: z.string()
});

export class RouterAgent extends CFAgent<Env> {
  
  // The Router / Classifier
  router = new Agent({
    name: "Router",
    instructions: "Classify the user input to route it to the correct department.",
    outputType: RouteSchema
  });

  // Specialized Agents
  billingAgent = new Agent({ name: "Billing", instructions: "Handle invoices and payments." });
  techAgent = new Agent({ name: "TechSupport", instructions: "Debug technical issues." });
  generalAgent = new Agent({ name: "General", instructions: "Helpful general assistant." });

  @callable()
  async handleRequest(query: string) {
    // 1. Classify
    const routeResult = await run(this.router, query);
    const route = routeResult.finalOutput;

    if (!route) return "Routing failed";

    console.log(`[Router] Routing to: ${route.category} (Reason: ${route.reasoning})`);

    // 2. Execute selected agent
    let targetAgent;
    switch (route.category) {
      case "billing": targetAgent = this.billingAgent; break;
      case "technical": targetAgent = this.techAgent; break;
      default: targetAgent = this.generalAgent; break;
    }

    const result = await run(targetAgent, query);
    return {
      category: route.category,
      response: result.finalOutput
    };
  }
}