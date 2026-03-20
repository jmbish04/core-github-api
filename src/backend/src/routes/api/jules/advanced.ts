import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { JulesSessionBuilder } from "@/services/jules/builder";
import { JulesService } from "@/services/jules/service";

const app = new Hono<{ Bindings: Env }>();

const schema = z.object({
  prompt: z.string().default("Create a simple python script that prints 'Hello Advanced Session!' and test it."),
});

app.post("/", zValidator("json", schema), async (c) => {
  const { prompt } = c.req.valid("json");
  
  try {
    const builder = new JulesSessionBuilder(c.env)
      .withPrompt(prompt)
      .withApproval(true); // Advanced session example uses wait for approval

    const session = await builder.start();
    
    // Demonstrate streaming capability initialization point
    return c.json({ 
      success: true, 
      sessionId: session.id,
      streamUrl: `/api/jules/stream/${session.id}`,
      instruction: "Session awaits approval. Monitor the streamUrl for 'awaitingPlanApproval' event, then call POST /api/jules/approve/:sessionId"
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post("/approve/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const jules = JulesService.getInstance(c.env);
  
  try {
    const session = await jules.getSession(sessionId);
    await session.approve();
    return c.json({ success: true, message: "Plan approved" });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
