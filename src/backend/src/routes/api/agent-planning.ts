import { Hono } from "hono";
import { getDb, planningRequestsUpscaling, planResponses, tasks, prReviewChecklists } from "@db";
import { eq, and } from "drizzle-orm";
import { createPlan } from "@/ai/providers/jules";
import { generateText } from "@/ai/providers";

// Helper to provide a CLI script for agents
const generateTaskManagementScript = (apiUrl: string) => `
#!/bin/bash
# Autonomous Agent Project Task Manager
# Use this script to list and update your tasks.

API_URL="${apiUrl}"

function list_incomplete_tasks() {
  local project_id="$1"
  curl -s "\${API_URL}/api/tasks/incomplete/\${project_id}"
}

function update_task_status() {
  local task_id="$1"
  local status="$2" # e.g. "IN_PROGRESS", "COMPLETED", "BLOCKED"
  curl -s -X POST -H "Content-Type: application/json" \\
       -d "{\\"status\\":\\"\${status}\\"}" \\
       "\${API_URL}/api/tasks/\${task_id}/status"
}

echo "Available Commands:"
echo "list_incomplete_tasks <project_id>"
echo "update_task_status <task_id> <status>"
`;

export const planningAgentRouter = new Hono<{ Bindings: Env }>();

planningAgentRouter.post("/generate", async (c) => {
  const body = await c.req.json();
  const prompt = body.prompt;
  const githubRepoUrl = body.githubRepoUrl;

  // Ideally this would run in a Durable Object or Queue to prevent timeout,
  // but for testing or simple plans we wait or stream.
  const planMarkdown = await createPlan(c.env, prompt, githubRepoUrl);
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
  
  const apiUrl = (new URL(c.req.url)).origin;
  
  return c.json({
    markdown: planRes?.response || "Plan not found",
    tasks: tasksData,
    instructions: "You are an autonomous coding agent executing a plan. Use the provided bash script to manage task status.",
    bashScript: generateTaskManagementScript(apiUrl)
  });
});

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
  // Here we would route to the appropriate supervisor agent / Honi agent.
  // For now, we simulate a supervisor responding using generateText.
  const answer = await generateText(c.env, `You are a Supervisor Agent. The coding agent asked: ${body.question}. Provide context.`);
  return c.json({ answer });
});

planningAgentRouter.post("/:id/review", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const db = getDb(c.env.DB);
  
  // Simulated review loop generating a checklist against the PR
  const reviewResult = await generateText(c.env, `Review the PR ${body.prUrl} against plan ${id}. List 3 checklist items needed to fix the PR.`);
  
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
