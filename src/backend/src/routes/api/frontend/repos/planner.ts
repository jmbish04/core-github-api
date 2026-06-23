/**
 * @file planner.ts
 * @description Project planning and roadmap management.
 * Handles phases, task trees, and AI-generated technical instructions and descriptions.
 */
import { Hono } from "hono";
import { JulesService } from "@/services/jules/service";
import { getDb, repositories, epics, stories, tasks } from "@db";
import { eq, asc, sql } from "drizzle-orm";
// import { streamText } from "hono/streaming";
import { 
  fetchProjectContext, 
  fetchProjectContextByOwnerRepo,
  generateUuid 
} from "./utils";
import { AIProvider } from "@/ai/providers";

const app = new Hono<{ Bindings: Env }>();



/**
 * GET /:owner/:repo
 * Retrieves a single project along with its phases (epics mapped to phases for legacy UI support).
 */
app.get("/:owner/:repo", async (c) => {
  const db = getDb(c.env.DB);
  const owner = c.req.param("owner");
  const repoName = c.req.param("repo");
  const ctx = await fetchProjectContextByOwnerRepo(db, owner, repoName);
  if (!ctx || !ctx.projectId) return c.json({ error: "Project not found" }, 404);
  const projectId = ctx.projectId;
  const project = await db.select().from(repositories).where(eq(repositories.id, projectId)).get();
  if (!project) return c.json({ error: "Project not found" }, 404);
  const phasesData = await db.select().from(epics).where(eq(epics.repoId, projectId)).orderBy(asc(epics.createdAt));
  const phases = phasesData.map(e => ({
    id: e.id,
    projectId: e.repoId,
    name: e.title,
    description: e.description,
    status: e.status,
    startDate: e.createdAt,
    endDate: e.updatedAt,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    technicalInstructions: null
  }));
  return c.json({ success: true, project, phases });
});

/**
 * GET /:owner/:repo/plan-tree
 * Retrieves the hierarchical plan tree (epics, stories, tasks mapped to plan items).
 */
app.get("/:owner/:repo/plan-tree", async (c) => {
  const db = getDb(c.env.DB);
  const owner = c.req.param("owner");
  const repoName = c.req.param("repo");
  const ctx = await fetchProjectContextByOwnerRepo(db, owner, repoName);
  if (!ctx || !ctx.projectId) return c.json({ error: "Project not found" }, 404);
  const projectId = ctx.projectId;
  const projectEpics = await db.select().from(epics).where(eq(epics.repoId, projectId)).orderBy(asc(epics.createdAt));
  const projectStories = await db.select().from(stories).where(eq(stories.repoId, projectId)).orderBy(asc(stories.createdAt));
  const projectTasks = await db.select().from(tasks).where(eq(tasks.repoId, projectId)).orderBy(asc(tasks.createdAt));
  
  const items: any[] = [];
  projectEpics.forEach(e => items.push({ ...e, itemType: "epic", parentId: null, name: e.title }));
  projectStories.forEach(s => items.push({ ...s, itemType: "story", parentId: s.parentId, name: s.title }));
  projectTasks.forEach(t => items.push({ ...t, itemType: "task", parentId: t.parentId, name: t.title }));

  return c.json({ success: true, items });
});

/**
 * POST /:owner/:repo/phases
 * Creates a new project phase (mapped to epic).
 */
app.post("/:owner/:repo/phases", async (c) => {
  const db = getDb(c.env.DB);
  const owner = c.req.param("owner");
  const repoName = c.req.param("repo");
  const ctx = await fetchProjectContextByOwnerRepo(db, owner, repoName);
  if (!ctx || !ctx.projectId) return c.json({ error: "Project not found" }, 404);
  const repoId = ctx.projectId;
  const body = await c.req.json() as any;
  const newId = generateUuid();

  const newPhase = {
    id: newId,
    repoId,
    title: body.name,
    description: body.description,
    status: "todo",
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await db.insert(epics).values(newPhase as any);
  
  const returnPhase = {
    ...newPhase,
    projectId: repoId,
    name: body.name,
    startDate: newPhase.createdAt,
    endDate: newPhase.updatedAt
  };
  return c.json({ success: true, phase: returnPhase });
});

/**
 * POST /:owner/:repo/generate-description
 * AI-powered project description generation based on codebase contents.
 */
app.post("/:owner/:repo/generate-description", async (c) => {
  const db = getDb(c.env.DB);
  const owner = c.req.param("owner");
  const repoName = c.req.param("repo");
  const ctx = await fetchProjectContextByOwnerRepo(db, owner, repoName);
  if (!ctx || !ctx.repoOwner || !ctx.repoName || !ctx.projectId) return c.json({ error: "Project context missing" }, 404);
  const projectId = ctx.projectId;

  const repoRecord = await db.select({ aiSummary: repositories.aiSummary }).from(repositories).where(eq(repositories.id, projectId)).get();
  const priorSummary = repoRecord?.aiSummary || ctx.projectDescription || "None";
  
  const prompt = `Generate a concise, technical description and summary for the repository ${ctx.repoOwner}/${ctx.repoName}.
Take into account:
1. The actual code base and file structures.
2. Active/pending PRs to summarize the changes in motion.
3. The prior AI summary (if any) to address any major deviations.
Prior Summary: ${priorSummary}

Please directly output ONLY the updated summary in your final message, no preamble.`;

  const jules = JulesService.getInstance(c.env);
  const session = await jules.startSession({
    prompt,
    repo: { owner: ctx.repoOwner, repo: ctx.repoName },
    projectId: projectId,
    requireApproval: false,
    autoPr: false
  });

  const outcome = await jules.collectSessionOutcome(session);
  const res = outcome.lastAgentMessage || "Generated AI Summary.";

  // Background persist to repositories table
  c.executionCtx.waitUntil(db.update(repositories).set({ aiSummary: res.trim() }).where(eq(repositories.id, projectId)));

  return c.text(res);
});

/**
 * POST /phases/:phaseId/generate-instructions
 * Generates implementation-ready technical instructions for a specific phase/epic.
 */
app.post("/phases/:phaseId/generate-instructions", async (c) => {
    const db = getDb(c.env.DB);
    const phaseId = c.req.param("phaseId");
    const epic = await db.select().from(epics).where(eq(epics.id, phaseId)).get();
    if (!epic) return c.json({ error: "Phase/Epic not found" }, 404);

    let repoContextStr = "";
    if (epic.repoId) {
        const ctx = await fetchProjectContext(db, epic.repoId);
        if (ctx) {
            repoContextStr = `\nRepository Context: ${ctx.repoOwner}/${ctx.repoName}\nProject Description: ${ctx.projectDescription || ctx.repoDescription || "No description provided."}`;
        }
    }

    const ai = new AIProvider(c.env);
    const res = await ai.runWithOpenAIAgent(
        `Phase/Epic: ${epic.title}\nDescription: ${epic.description || "No description provided."}${repoContextStr}`,
        {
            name: "PhaseLead",
            instructions: "Generate implementable technical instructions in Markdown."
        }
    );

    await db.update(epics).set({ 
        description: sql`coalesce(${epics.description}, '') || '\n\n## AI Instructions\n' || ${res}`, 
        updatedAt: new Date() 
    }).where(eq(epics.id, phaseId));
    return c.json({ success: true, instructions: res });
});

export default app;
