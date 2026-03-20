import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { JulesSessionBuilder } from "@/services/jules/builder";

const app = new Hono<{ Bindings: Env }>();

const schema = z.object({
  prompt: z.string().default("Create a simple python script that prints 'Hello World!' and test it."),
});

app.post("/", zValidator("json", schema), async (c) => {
  const { prompt } = c.req.valid("json");
  
  try {
    const builder = new JulesSessionBuilder(c.env)
      .withPrompt(prompt)
      .withoutApproval();

    // In a repo-less environment like the simple example, we use runRepolessSession 
    // or standard run if it is available on the builder. 
    // Here we'll start a session mapped somewhat to the simple example:
    const session = await builder.start();
    
    return c.json({ success: true, sessionId: session.id });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
