/**
 * @file backend/src/routes/api/research.ts
 * @description Research API endpoints for triggering and monitoring DeepResearchWorkflow
 */

import { Hono } from "hono";
import { getDb } from "@db";
import { researchBriefs, researchCandidates, researchExecutionLogs } from "@/db/schemas/github/research";
import { eq, desc } from "drizzle-orm";
import { sendRepoDiscoveryEmail } from "@/utils/email/send/repo-discovery";

const app = new Hono<{ Bindings: Env }>();

// Create Brief / Start Research
app.post("/create", async (c) => {
  const body = await c.req.json();
  const { title, requirements, userId } = body;
  
  if (!title || !requirements) return c.json({ error: "Missing title or requirements" }, 400);

  // We invoke the TopicOrchestratorAgent to handle the creation and initial planning
  // We need a unique ID for the agent, or we use a standard "Dispatcher" pattern?
  // The plan says TopicOrchestratorAgent manages the brief. 
  // Let's create a new brief ID and use that for the agent ID to keep it 1:1 stateful.
  const id = c.env.TOPIC_ORCHESTRATOR.newUniqueId();
  const stub = c.env.TOPIC_ORCHESTRATOR.get(id) as any; // Use newUniqueId for a fresh agent
  
  // Create brief via RPC
  const brief = await (stub as any).submitBrief(userId || "anon", title, requirements);
  
  return c.json({ brief, agentId: id.toString() });
});

// List Recent Briefs
app.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const briefs = await db.query.researchBriefs.findMany({
    orderBy: [desc(researchBriefs.createdAt)],
    limit: 20
  });
  return c.json({ briefs });
});

// Get Brief Status, Logs, and Candidates
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  
  const brief = await db.query.researchBriefs.findFirst({
    where: eq(researchBriefs.id, id)
  });
  
  if (!brief) return c.json({ error: "Brief not found" }, 404);

  const candidates = await db.query.researchCandidates.findMany({
    where: eq(researchCandidates.briefId, id)
  });
  
  return c.json({ brief, candidates });
});

// Get Execution Logs
app.get("/:id/logs", async (c) => {
  const id = c.req.param("id"); // Brief ID
  const db = getDb(c.env.DB);
  
  const logs = await db.query.researchExecutionLogs.findMany({
    where: eq(researchExecutionLogs.briefId, id),
    orderBy: [desc(researchExecutionLogs.createdAt)],
    limit: 100
  });
  
  return c.json({ logs });
});

// Approve Candidates (HITL)
app.post("/:id/approve", async (c) => {
  const briefId = c.req.param("id");
  const { candidateIds } = await c.req.json(); // Array of UUIDs
  
  const db = getDb(c.env.DB);
  
  if (!candidateIds || !Array.isArray(candidateIds)) {
      return c.json({ error: "Invalid candidateIds" }, 400);
  }

  // Update candidates
  for (const cid of candidateIds) {
      await db.update(researchCandidates)
        .set({ userRating: "keep" })
        .where(eq(researchCandidates.id, cid));
  }
  
  // Trigger Deep Dive or Resume
  // For now, we just update status. 
  // In a real flow, we'd trigger the next workflow step here.
  // c.env.DEEP_RESEARCH_WORKFLOW.create({ ... })
  
  return c.json({ success: true, count: candidateIds.length });
});

// Trigger Job (Manual test)
app.post("/trigger-job", async (c) => {
  const body = await c.req.json();
  const { title, repoUrl, repoOwner, repoName, userId } = body;
  
  if (!repoUrl) return c.json({ error: "Missing repoUrl" }, 400);

  const instance = await c.env.DEEP_RESEARCH_WORKFLOW.create({
    params: {
      repoUrl,
      repoOwner: repoOwner || "unknown",
      repoName: repoName || "unknown",
      mode: "targeted",
    },
  });

  return c.json({ success: true, workflowId: instance.id });
});

// Test Email (Manual test)
app.post("/test-email", async (c) => {
  if (!c.env.SEND_EMAIL_NEWSLETTER) {
    return c.json({ error: "Email binding not configured" }, 500);
  }
  
  await sendRepoDiscoveryEmail(c.env as any, {
    subject: `Test Deep Research Trends - ${new Date().toISOString()}`,
    title: `Test Daily Trends`,
    dailyTrendsData: {
      date: new Date().toLocaleDateString(),
      trend_summary: `This is a test summary generated manually.`,
      top_picks: [
        {
          name: "Test User / Test Repo",
          url: "https://github.com/test/test",
          category: "Research",
          why_its_interesting: "Testing email functionality",
          innovation_score: 9
        }
      ]
    },
    plainTextFallback: `Fallback plain text test.`
  });

  return c.json({ success: true, message: "Email triggered" });
});

export default app;
