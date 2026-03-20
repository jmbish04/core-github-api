import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { JulesSessionBuilder } from "@/services/jules/builder";

const app = new Hono<{ Bindings: Env }>();

const schema = z.object({
  taskDescription: z.string().describe("The task or bug to solve."),
  sourceContext: z.string().optional().describe("Optional source context (repo name, file paths)."),
});

/**
 * Emulates the Jules SDK `mcp-plan-generation` example but exposed over HTTP.
 * This can be wired into an MCP server like Codex-Orchestrator-MCP natively.
 */
app.post("/generate-plan", zValidator("json", schema), async (c) => {
  const { taskDescription, sourceContext } = c.req.valid("json");
  
  try {
    const prompt = `Create a detailed coding plan for: ${taskDescription}\n${sourceContext ? `\nContext:\n${sourceContext}` : ""}\n\nInclude: reference implementation, build commands, test commands, verification checks. Format in Markdown.`;

    const builder = new JulesSessionBuilder(c.env)
      .withPrompt(prompt)
      .withoutApproval(); // Repoless plan generation

    // In a real implementation we would await runRepolessSession to extract the plan text
    const session = await builder.start();
    
    return c.json({ success: true, sessionId: session.id, message: "Plan generation session started." });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
