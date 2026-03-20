import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { JulesSessionBuilder } from "@/services/jules/builder";

const app = new Hono<{ Bindings: Env }>();

const schema = z.object({
  tasks: z.array(z.string()).min(1).default([
     "Analyze the repository and list potential improvements",
     "Write a script to automate the deployment process"
  ])
});

app.post("/", zValidator("json", schema), async (c) => {
  const { tasks } = c.req.valid("json");
  
  try {
    // Mimics Jules SDK's concurrent session spawn example
    // jules.all(tasks, t => ({ prompt: t }))
    const sessionPromises = tasks.map(task => {
        return new JulesSessionBuilder(c.env)
          .withPrompt(task)
          .withoutApproval()
          .start();
    });

    const sessions = await Promise.allSettled(sessionPromises);
    
    return c.json({ 
       success: true, 
       sessions: sessions.map((s, i) => ({
          task: tasks[i],
          status: s.status,
          ...(s.status === 'fulfilled' ? { sessionId: s.value.id } : { error: s.reason })
       }))
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
