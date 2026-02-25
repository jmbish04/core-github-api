
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { JulesService } from "@services/jules";
import { streamText } from "hono/streaming";


const app = new Hono<{ Bindings: Env }>();

// Schema for starting a session
const startSessionSchema = z.object({
  prompt: z.string().min(1),
  repoUrl: z.string().optional(), // Expected format: https://github.com/owner/repo or owner/repo
  autoPr: z.boolean().default(false),
});

app.post("/start", zValidator("json", startSessionSchema), async (c) => {
  const { prompt, repoUrl, autoPr } = c.req.valid("json");
  const julesService = JulesService.getInstance(c.env);

  let repo: { owner: string; repo: string; branch?: string } | undefined;

  if (repoUrl) {
    // Basic parsing for GitHub URLs
    // Supports:
    // - https://github.com/owner/repo
    // - owner/repo
    let cleanUrl = repoUrl.replace("https://github.com/", "");
    if (cleanUrl.endsWith(".git")) cleanUrl = cleanUrl.slice(0, -4);
    
    const parts = cleanUrl.split("/");
    if (parts.length >= 2) {
      let branch = undefined;
      // Handle https://github.com/owner/repo/tree/branch-name/maybe/slashes
      if (parts.length >= 4 && (parts[2] === "tree" || parts[2] === "blob")) {
        // Collect everything after /tree/ or /blob/ as the branch
        // In reality, this might include file paths if it's a blob URL,
        // but for session context, the branch or path starting with branch is better than nothing.
        // Usually users provide /tree/branch-name
        branch = parts.slice(3).join("/");
      }

      repo = {
        owner: parts[0],
        repo: parts[1],
        ...(branch ? { branch } : {})
      };
    }
  }

  try {
    const session = await julesService.startSession({
      prompt,
      repo,
      autoPr,
    });

    return c.json({
      success: true,
      sessionId: session.id,
      status: await session.info().then(i => i.state),
    });
  } catch (error: any) {
    console.error("Failed to start Jules session:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.get("/stream/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const julesService = JulesService.getInstance(c.env);

  return streamText(c as any, async (stream) => {
    try {
      const activityStream = await julesService.streamSession(sessionId);
      
      // Send initial connection message
      await stream.write(JSON.stringify({ event: 'connected', sessionId }) + '\n\n');

      for await (const activity of activityStream) {
        // Transform functionality to SSE events
        // The SDK activity object structure needs to be serialized
        // SDK typings: type, message, plan, artifacts, etc.
        
        await stream.write(JSON.stringify({ 
            event: 'activity', 
            data: activity 
        }) + '\n\n');
        
        if (activity.type === 'sessionCompleted' || activity.type === 'sessionFailed') {
             // Fetch final result
             const result = await julesService.getSessionResult(sessionId);
             await stream.write(JSON.stringify({
                 event: 'result',
                 data: result
             }) + '\n\n');
             break;
        }
      }
    } catch (error: any) {
      await stream.write(JSON.stringify({ event: 'error', error: error.message }) + '\n\n');
    }
  });
});

app.get("/status/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const julesService = JulesService.getInstance(c.env);
  
  try {
      const session = await julesService.getSession(sessionId);
      const info = await session.info();
      return c.json({ success: true, info });
  } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
  }
});

export default app;
