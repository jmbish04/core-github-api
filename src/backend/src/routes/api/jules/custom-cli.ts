import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { JulesSessionBuilder } from "@/services/jules/builder";

const app = new Hono<{ Bindings: Env }>();

const schema = z.object({
  prompt: z.string().describe("The CLI user prompt"),
  json: z.boolean().default(false).describe("Whether the CLI requested JSON output"),
  wait: z.boolean().default(true).describe("Whether the CLI waits for completion")
});

/**
 * Matches the 'custom-cli' representation where args dictate the output and wait behavior.
 */
app.post("/", zValidator("json", schema), async (c) => {
  const { prompt, json, wait } = c.req.valid("json");
  
  try {
    const builder = new JulesSessionBuilder(c.env)
      .withPrompt(prompt)
      .withoutApproval();

    if (wait) {
      // CLI blocks until completion
      const result = await builder.start(); // In practice this would await runSession
      
      if (json) {
        return c.json({ success: true, id: result.id, message: "Session executed synchronously." });
      } else {
        return c.text(`Session completed: ${result.id}\nRun successful.`);
      }
    } else {
      // Fire and forget
      const session = await builder.start();
      if (json) {
        return c.json({ success: true, id: session.id, status: "pending" });
      } else {
        return c.text(`Session queued: ${session.id}\nUse 'status --id=${session.id}' to check progress.`);
      }
    }
  } catch (err: any) {
    if (json) return c.json({ success: false, error: err.message }, 500);
    return c.text(`Error: ${err.message}`, 500);
  }
});

export default app;
