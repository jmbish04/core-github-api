
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { JulesService } from "@/services/jules/service";
import { JulesSessionBuilder } from "@/services/jules/builder";
import { streamText } from "hono/streaming";
import { getDb } from "@/db";
import { julesJobs } from "@/db/schemas/agents/jules";
import { eq } from "drizzle-orm";
import { generateUuid } from "@/utils/common";
import { buildCodingAgentInstructions } from "@/services/golden-path-config";
import { getAgentByName } from 'agents';


const app = new Hono<{ Bindings: Env }>();

// Schema for starting a session
const startSessionSchema = z.object({
  prompt: z.string().min(1),
  repoUrl: z.string().optional(), // Expected format: https://github.com/owner/repo or owner/repo
  autoPr: z.boolean().default(false),
  mode: z.enum(["session", "run"]).default("session"),
  force_overseer: z.boolean().default(false),
  session_id: z.string().optional(),
  inject_standards: z.boolean().default(true),
});

app.post("/start", zValidator("json", startSessionSchema), async (c) => {
  const { prompt, repoUrl, autoPr, mode, force_overseer, session_id, inject_standards } = c.req.valid("json");
  const julesService = JulesService.getInstance(c.env);
  const db = getDb(c.env.DB);
  const standards = inject_standards
    ? await buildCodingAgentInstructions(c.env)
    : "";
  const enhancedPrompt = inject_standards ? `${prompt}\n\n${standards}` : prompt;
  const sessionId = session_id || generateUuid();

  if (mode === "run") {
      try {
          const runResult = await julesService.runSession(enhancedPrompt);
          return c.json({
              success: true,
              mode: "run",
              result: runResult
          });
      } catch (error: any) {
          console.error("Failed to run Jules repoless session:", error);
          return c.json({ success: false, mode: "run", error: error.message }, 500);
      }
  }

  // mode === "session"
  let repo: { owner: string; repo: string; branch?: string } | undefined;

  if (repoUrl) {
    let cleanUrl = repoUrl.replace("https://github.com/", "");
    if (cleanUrl.endsWith(".git")) cleanUrl = cleanUrl.slice(0, -4);
    
    const parts = cleanUrl.split("/");
    if (parts.length >= 2) {
      let branch: string | undefined = undefined;
      if (parts.length >= 4 && (parts[2] === "tree" || parts[2] === "blob")) {
        branch = parts.slice(3).join("/");
      }

      repo = {
        owner: parts[0],
        repo: parts[1],
        ...(branch ? { branch } : {})
      };
    }
  }

  // Create Job Record
  let jobId: number | undefined;
  if (repo) {
    try {
        const [job] = await db.insert(julesJobs).values({
            sessionId: sessionId,
            repoFullName: `${repo.owner}/${repo.repo}`,
            prompt: enhancedPrompt,
            status: 'pending'
        }).returning();
        jobId = job?.id;
    } catch (e) {
        console.warn("Failed to create jules job record", e);
    }
  }

  try {
    const builder = new JulesSessionBuilder(c.env)
      .withPrompt(enhancedPrompt)
      .withAutoPr(autoPr)
      .withSessionId(sessionId);

    if (repo) builder.withRepo(repo.owner, repo.repo, repo.branch);
    
    const session = await builder.start();
    
    if (jobId && session.id !== sessionId) {
        await db.update(julesJobs)
            .set({ sessionId: session.id })
            .where(eq(julesJobs.id, jobId));
    }

    // Trigger Overseer
    if (force_overseer) {
        const agent = await getAgentByName(c.env.ORCHESTRATOR_AGENT as any, "jules-overseer-singleton");
        // Direct DO RPC — call @callable checkSchedule() on OrchestratorAgent
        c.executionCtx.waitUntil((agent as any).checkSchedule());
    }

    let status = "connecting";
    try {
        status = await session.info().then((i: any) => i.state);
    } catch (e) { 
        console.error("Failed to get session info:", JSON.stringify(e));
    }

    return c.json({
      success: true,
      mode: "session",
      sessionId: session.id,
      jobId,
      status: status,
    });
  } catch (error: any) {
    console.error("Failed to start Jules session:", error);
    return c.json({ success: false, mode: "session", error: error.message }, 500);
  }
});

// Alias for /invoke wrapper backward compat.
app.post("/invoke", zValidator("json", startSessionSchema), async (c) => {
    // Re-use logic
    return app.request('/start', c.req.raw, c.env, c.executionCtx);
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
  const wantsSnapshot = c.req.query("snapshot") === "true";
  const julesService = JulesService.getInstance(c.env);
  
  try {
      if (wantsSnapshot) {
          const snapshot = await julesService.getSessionSnapshot(sessionId);
          return c.json({ success: true, isSnapshot: true, snapshot });
      }

      const session = await julesService.getSession(sessionId);
      const info = await session.info();
      return c.json({ success: true, info });
  } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
  }
});

export default app;
