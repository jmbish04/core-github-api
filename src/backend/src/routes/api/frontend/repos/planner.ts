/**
 * @file planner.ts
 * @description Project planning and roadmap management.
 * Handles phases, task trees, and AI-generated technical instructions and descriptions.
 */

import { Hono } from "hono";
import { getDb, projects, projectPhases, projectPlans, repositories, tasks } from "@db";
import { eq, asc, desc } from "drizzle-orm";
import { streamText } from "hono/streaming";
import { 
  fetchProjectContext, 
  generateUuid 
} from "./utils";
import { 
  resolveDefaultAiModel, 
  resolveDefaultAiProvider, 
  runTextAgent, 
  streamTextAgent 
} from "@/ai/agents/support/agent-ai";
import { getOctokit } from "@/services/octokit/core";
import { KanbanColumn, TaskStatus } from "@/types/project-management/enums";

const app = new Hono<{ Bindings: Env }>();

/**
 * Internal helper to pick a set of relevant files for generating a project summary.
 */
function pickSummaryFiles(paths: string[]): string[] {
  const preferred = ["README.md", "wrangler.jsonc", "package.json", "src/index.ts"];
  const picked = new Set<string>();
  for (const candidate of preferred) {
    const match = paths.find(p => p.toLowerCase() === candidate.toLowerCase());
    if (match) picked.add(match);
  }
  return Array.from(picked).concat(paths.slice(0, 5)).slice(0, 10);
}

/**
 * Internal helper to fetch repository file text.
 */
async function fetchFileText(env: Env, owner: string, repo: string, path: string, ref?: string) {
    try {
        const octokit = await getOctokit(env);
        const { data } = await octokit.repos.getContent({ owner, repo, path, ...(ref ? { ref } : {}) }) as any;
        if (data.type === "file" && data.content) return Buffer.from(data.content, "base64").toString("utf-8");
    } catch { return null; }
    return null;
}

/**
 * GET /:id
 * Retrieves a single project along with its phases.
 */
app.get("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const projectId = c.req.param("id");
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return c.json({ error: "Project not found" }, 404);
  const phases = await db.select().from(projectPhases).where(eq(projectPhases.projectId, projectId)).orderBy(asc(projectPhases.startDate));
  return c.json({ success: true, project, phases });
});

/**
 * GET /:id/plan-tree
 * Retrieves the hierarchical plan tree (epics, stories, tasks).
 */
app.get("/:id/plan-tree", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(projectPlans).where(eq(projectPlans.projectId, c.req.param("id")))
    .orderBy(asc(projectPlans.itemType), asc(projectPlans.orderIndex));
  return c.json({ success: true, items: rows.map(r => ({ ...r, metadata: r.metadataJson ? JSON.parse(r.metadataJson) : {} })) });
});

/**
 * POST /:id/phases
 * Creates a new project phase.
 */
app.post("/:id/phases", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json() as any;
  const newPhase = {
    id: generateUuid(),
    projectId: c.req.param("id"),
    name: body.name,
    description: body.description,
    status: "pending",
    startDate: body.startDate,
    endDate: body.endDate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await db.insert(projectPhases).values(newPhase);
  return c.json({ success: true, phase: newPhase });
});

/**
 * POST /:id/generate-description
 * AI-powered project description generation based on codebase contents.
 */
app.post("/:id/generate-description", async (c) => {
  const db = getDb(c.env.DB);
  const projectId = c.req.param("id");
  const ctx = await fetchProjectContext(db, projectId);
  if (!ctx || !ctx.repoOwner || !ctx.repoName) return c.json({ error: "Project context missing" }, 404);

  const provider = resolveDefaultAiProvider(c.env);
  const model = resolveDefaultAiModel(c.env, provider);
  
  return streamText(c, async (stream) => {
    const runner = await streamTextAgent({
      env: c.env, provider, model, name: "ProjectSummarizer",
      instructions: "Generate a concise, technical description for this repository.",
      input: `Analyze repository ${ctx.repoOwner}/${ctx.repoName}. Current description: ${ctx.projectDescription || "None"}`
    });

    let fullOutput = "";
    for await (const chunk of runner.toTextStream() as unknown as AsyncIterable<string>) {
      fullOutput += chunk;
      await stream.write(chunk);
    }
    
    // Background persist
    c.executionCtx.waitUntil(db.update(projects).set({ description: fullOutput.trim() }).where(eq(projects.id, projectId)));
  });
});

/**
 * POST /phases/:phaseId/generate-instructions
 * Generates implementation-ready technical instructions for a specific phase.
 */
app.post("/phases/:phaseId/generate-instructions", async (c) => {
    const db = getDb(c.env.DB);
    const phaseId = c.req.param("phaseId");
    const phase = await db.select().from(projectPhases).where(eq(projectPhases.id, phaseId)).get();
    if (!phase) return c.json({ error: "Phase not found" }, 404);

    const provider = resolveDefaultAiProvider(c.env);
    const model = resolveDefaultAiModel(c.env, provider);
    const res = await runTextAgent({
        env: c.env, provider, model, name: "PhaseLead",
        instructions: "Generate implementable technical instructions in Markdown.",
        input: `Phase: ${phase.name}. Description: ${phase.description}`
    });

    await db.update(projectPhases).set({ technicalInstructions: res, updatedAt: new Date().toISOString() }).where(eq(projectPhases.id, phaseId));
    return c.json({ success: true, instructions: res });
});

export default app;
