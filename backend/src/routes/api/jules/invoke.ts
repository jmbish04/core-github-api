
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { JULES_STANDARDS } from "@/config/jules-standards";
import { JulesService } from "@/services/jules";
import { getDb } from "@/db";
import { julesJobs } from "@/db/schemas/agents/jules";
import { eq } from "drizzle-orm";
import { generateUuid } from "@/utils/common";

const invokeApi = new OpenAPIHono<{ Bindings: Env }>();

const InvokeSchema = z.object({
  prompt: z.string(),
  repo: z.object({
    owner: z.string(),
    name: z.string(),
    branch: z.string().optional(),
  }),
  force_overseer: z.boolean().default(true),
  session_id: z.string().optional(),
});

invokeApi.openapi(
  createRoute({
    method: "post",
    path: "/",
    summary: "Invoke Jules Orchestrator",
    description: "Manually triggers a Jules session with standards injection and Overseer tracking.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: InvokeSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Session started",
        content: {
          "application/json": {
            schema: z.object({
              session_id: z.string(),
              job_id: z.number(),
              message: z.string(),
            }),
          },
        },
      },
      401: { description: "Unauthorized" },
      500: { description: "Server Error" },
    },
  }),
  async (c) => {
    // Auth Check
    const apiKey = c.req.header("X-API-Key");
    const { getWorkerApiKey } = await import("@utils/secrets");
    const validKey = await getWorkerApiKey(c.env);

    if (apiKey !== validKey) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = c.req.valid("json");
    const db = getDb(c.env.DB);
    const julesService = JulesService.getInstance(c.env);

    // 1. Prepare Prompt with Standards
    const enhancedPrompt = `${body.prompt}\n\n${JULES_STANDARDS}`;
    const sessionId = body.session_id || generateUuid();

    // 2. Create Job Record
    const [job] = await db.insert(julesJobs).values({
        sessionId: sessionId,
        repoFullName: `${body.repo.owner}/${body.repo.name}`,
        prompt: enhancedPrompt,
        status: 'pending'
    }).returning();

    // 3. Start Session
    try {
        const session = await julesService.startSession({
            prompt: enhancedPrompt,
            repo: {
                owner: body.repo.owner,
                repo: body.repo.name, 
                branch: body.repo.branch
            },
            sessionId: sessionId
        });

        // If returned session ID differs from what we generated (SDK override), update job
        if (session.id !== sessionId) {
            console.log(`[Invoke] Updating job ${job.id} with real session ID ${session.id}`);
            // Use sql to update (or just update)
            await db.update(julesJobs)
                .set({ sessionId: session.id })
                .where(eq(julesJobs.id, job.id)); // Assuming 'job' has 'id' (it does)
        }

    } catch (e: any) {
        console.error("Failed to start Jules:", e);
        return c.json({ error: "Failed to start session", details: e.message }, 500);
    }

    // 4. Trigger Overseer (Optional check if explicitly requested)
    if (body.force_overseer) {
        const id = c.env.JULES_OVERSEER.idFromName("jules-overseer-singleton");
        const overseer = c.env.JULES_OVERSEER.get(id);
        // We invoke fetch directly on the stub
        await overseer.fetch("http://internal/schedule/check");
    }

    return c.json({
        session_id: sessionId,
        job_id: job.id,
        message: "Jules invoked successfully"
    });
  }
);

export default invokeApi;
