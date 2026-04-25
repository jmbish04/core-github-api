import { Hono } from "hono";
import { getDb, planningRequestsUpscaling, planResponses, tasks, prReviewChecklists, projectPlanningRequests } from "@db";
import { eq, and } from "drizzle-orm";
import { AIProvider } from '@/ai/providers';
import { getAgentByName } from "agents";

export const planningAgentRouter = new Hono<{ Bindings: Env }>();

/**
 * Lists all active planning session rooms
 */
planningAgentRouter.get("/rooms/active", async (c) => {
  const db = getDb(c.env.DB);
  
  const activeRooms = await db.query.projectPlanningRequests.findMany({
    // Return anything that is not in a terminal state
    // 'queued', 'running', 'awaiting_stitch_approval', 'awaiting_plan_approval', 'approved', 'revising', 'orchestrating', 'implementing'
    where: (requests, { notInArray }) => notInArray(requests.status, ['completed', 'rejected', 'failed', 'cancelled'] as any),
    orderBy: (requests, { desc }) => [desc(requests.updatedAt)],
    limit: 50,
  });
  
  return c.json({ rooms: activeRooms });
});

/**
 * Orchestrates a new technical planning session via the EngineerAgent.
 */
planningAgentRouter.post("/orchestrate", async (c) => {
  const body = await c.req.json();
  const requestId = body.requestId;

  if (!requestId) {
    return c.json({ error: "requestId is required" }, 400);
  }

  // Get the EngineerAgent stub
  // We use the requestId as the Durable Object ID to maintain affinity
  const agent = await getAgentByName(c.env.ENGINEER_AGENT as any, requestId);
  
  // Call the @callable createPlan method
  const result = await (agent as any).createPlan(requestId);

  return c.json({ success: true, ...result });
});

/**
 * Executes an approved plan.
 */
planningAgentRouter.post("/execute", async (c) => {
  const body = await c.req.json();
  const requestId = body.requestId;

  if (!requestId) {
    return c.json({ error: "requestId is required" }, 400);
  }

  const agent = await getAgentByName(c.env.ENGINEER_AGENT as any, requestId);
  const result = await (agent as any).executeImplementation(requestId);

  return c.json({ success: true, ...result });
});

planningAgentRouter.post("/generate", async (c) => {
  const body = await c.req.json();
  const prompt = body.prompt;
  const githubRepoUrl = body.githubRepoUrl;

  const ai = new AIProvider(c.env);
  const planMarkdown = await ai.createPlan(prompt, githubRepoUrl);
  return c.json({ success: true, plan: planMarkdown });
});

planningAgentRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  
  const planRes = await db.query.planResponses.findFirst({
    where: eq(planResponses.planningRequestId, id)
  });
  
  const tasksData = await db.query.tasks.findMany({
    where: eq(tasks.repoId, id)
  });
  
  return c.json({
    markdown: planRes?.response || "Plan not found",
    tasks: tasksData
  });
});

// ... rest of legacy helpers remain for compatibility ...

planningAgentRouter.get("/:id/research", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  
  const results = await db.query.planningRequestsUpscaling.findMany({
    where: eq(planningRequestsUpscaling.planningRequestId, id)
  });
  
  return c.json({ research: results });
});

planningAgentRouter.get("/checklist/:prId", async (c) => {
  const prId = c.req.param("prId");
  const db = getDb(c.env.DB);
  
  const checklist = await db.query.prReviewChecklists.findMany({
    where: eq(prReviewChecklists.prUrl, prId)
  });
  
  return c.json({ checklist });
});

planningAgentRouter.patch("/checklist-item/:itemId", async (c) => {
  const itemId = c.req.param("itemId");
  const body = await c.req.json();
  const db = getDb(c.env.DB);
  
  await db.update(prReviewChecklists)
    .set({ status: body.status })
    .where(eq(prReviewChecklists.id, itemId));
    
  return c.json({ success: true });
});

planningAgentRouter.get("/tasks/incomplete/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const db = getDb(c.env.DB);
  
  const tasksData = await db.query.tasks.findMany({
    where: and(
      eq(tasks.repoId, projectId),
      eq(tasks.status, "todo")
    )
  });
  
  return c.json({ tasks: tasksData });
});

planningAgentRouter.post("/tasks/:taskId/status", async (c) => {
  const taskId = c.req.param("taskId");
  const body = await c.req.json();
  const db = getDb(c.env.DB);
  
  await db.update(tasks)
    .set({ status: body.status })
    .where(eq(tasks.id, taskId));
    
  return c.json({ success: true });
});

planningAgentRouter.post("/:id/question", async (c) => {
  const body = await c.req.json();
  // Here we would route to the appropriate supervisor agent.
  // For now, we simulate a supervisor responding using generateText.
  const ai = new AIProvider(c.env);
  const answer = await ai.generateText(`You are a Supervisor Agent. The coding agent asked: ${body.question}. Provide context.`);
  return c.json({ answer });
});

planningAgentRouter.post("/:id/review", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const db = getDb(c.env.DB);
  
  // Simulated review loop generating a checklist against the PR
  const ai = new AIProvider(c.env);
  const reviewResult = await ai.generateText(`Review the PR ${body.prUrl} against plan ${id}. List 3 checklist items needed to fix the PR.`);
  
  // Naive splitting for mockup
  const items = reviewResult.split("\n").filter(i => i.trim().length > 0).map(i => i.replace(/^(\d+\.|-)\s*/, ''));
  
  for (const item of items) {
    await db.insert(prReviewChecklists).values({
      id: crypto.randomUUID(),
      planningRequestId: id,
      prUrl: body.prUrl,
      item: item,
      status: "PENDING",
      iteration: 1
    });
  }
  
  return c.json({ success: true, message: "Review generated.", reviewResult });
});

planningAgentRouter.post("/:id/verify", async (c) => {
  const body = await c.req.json(); // EXPECT { prUrl: string }
  const db = getDb(c.env.DB);
  
  // Verify checklist items
  const checkList = await db.query.prReviewChecklists.findMany({
    where: eq(prReviewChecklists.prUrl, body.prUrl)
  });
  
  const allComplete = checkList.every(c => c.status === "COMPLETE_PENDING_REVIEW" || c.status === "VERIFIED");
  
  if (allComplete) {
    // Upscale status to VERIFIED
    for (const item of checkList) {
      await db.update(prReviewChecklists)
        .set({ status: "VERIFIED" })
        .where(eq(prReviewChecklists.id, item.id));
    }
    return c.json({ success: true, message: "Successfully implemented. Checklists verified." });
  } else {
    return c.json({ success: false, message: "Review failed. Please complete checklist items." });
  }
});

export default planningAgentRouter;
