import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { JulesSessionBuilder } from "@/services/jules/builder";

const app = new Hono<{ Bindings: Env }>();

/**
 * Emulates building a custom MCP server utilizing the agents SDK.
 * Exposes a tool registration wrapper.
 */
app.post("/custom-tool", zValidator("json", z.object({
  toolName: z.string(),
  prompt: z.string()
})), async (c) => {
  const { toolName, prompt } = c.req.valid("json");
  
  try {
    // Treat the tool execution as a Jules session mapped to a specific tool's goal
    const builder = new JulesSessionBuilder(c.env)
      .withPrompt(`Execute MCP Tool [${toolName}]: ${prompt}`)
      .withoutApproval();

    const session = await builder.start();
    
    return c.json({ success: true, toolName, sessionId: session.id });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
