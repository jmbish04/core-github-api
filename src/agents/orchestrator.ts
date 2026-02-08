import { Agent } from "agents";
import { Bindings } from "../utils/hono";
import { createGeminiClient } from "../lib/gemini";

export class OrchestratorAgent extends Agent<Bindings> {
  async onMessage(connection: WebSocket, message: string) {
    // Basic setup
    if (!this.env.GOOGLE_API_KEY) {
      connection.send(JSON.stringify({ type: "error", content: "GOOGLE_API_KEY not configured" }));
      return;
    }

    const ai = createGeminiClient(this.env);

    // 1. Check if the user is asking for a plan
    // Simple heuristic: "plan" in the message. In a real app, use a router LLM call.
    if (message.toLowerCase().includes("plan")) {

      // Notify client: "I'm thinking..."
      connection.send(JSON.stringify({ type: "status", content: "Contacting Planner Agent..." }));

      try {
        // 2. CALL THE SUB-AGENT (Inter-Agent Communication)
        // We create a unique ID for the planner (using a singleton name 'global-planner' for simplicity across sessions)
        const plannerId = this.env.PLANNER.idFromName("global-planner");
        const plannerStub = this.env.PLANNER.get(plannerId);

        // 3. Fetch structured data from the sub-agent
        // The PlannerAgent expects a POST with { goal: string }
        const planResponse = await plannerStub.fetch("http://internal/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal: message })
        });

        if (!planResponse.ok) {
          throw new Error(`Planner failed: ${planResponse.status} ${await planResponse.text()}`);
        }

        const planJson = await planResponse.json();

        // 4. Send "Tool Result" to client (Compatible with AI Elements rendering)
        connection.send(JSON.stringify({
          type: "tool-result",
          toolName: "create_plan",
          result: planJson
        }));

      } catch (error: any) {
        connection.send(JSON.stringify({ type: "error", content: `Planning failed: ${error.message}` }));
      }

    } else {
      // Normal Chat Logic
      try {
        const result = await ai.models.generateContentStream({
          model: this.env.GEMINI_MODEL || "gemini-2.0-flash-exp",
          contents: [{ role: "user", parts: [{ text: message }] }]
        });

        for await (const chunk of result) {
          connection.send(JSON.stringify({
            type: "text",
            content: chunk.text
          }));
        }
      } catch (error: any) {
        connection.send(JSON.stringify({ type: "error", content: `Chat failed: ${error.message}` }));
      }
    }
  }
}
