/**
 * @file actions.ts
 * @description AI-agent-driven project actions and automated codebase operations.
 * Handles assistant interaction, docstring generation, and landing page previews.
 */

import { Hono } from "hono";
import { getDb } from "@db";
import { fetchProjectContext } from "./utils";
import { CodeGeneratorAgent } from "@/ai/agents/SoftwareEngineer";
import { DocstringsService } from "@services/docstrings";
import { generateLandingPage } from "@services/landing-generator";
import { JulesService } from "@/services/jules/jules";

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /:id/assistant
 * Dispatches an engineering task to the Project Assistant Agent.
 */
app.post("/:id/assistant", async (c) => {
  const db = getDb(c.env.DB);
  const projectId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { prompt?: string };
  // Logic for runner, agent creation, and plan saving...
  return c.json({ success: true, message: "Handled by Assistant Agent (Mock)" });
});

/**
 * POST /:id/jules/dispatch
 * Direct handoff of a technical task to the Jules agent session.
 */
app.post("/:id/jules/dispatch", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json() as any;
  const ctx = await fetchProjectContext(db, c.req.param("id"));
  if (!ctx) return c.json({ error: "Context missing" }, 404);

  const jules = JulesService.getInstance(c.env);
  const session = await jules.startSession({
    prompt: body.prompt,
    repo: { owner: ctx.repoOwner!, repo: ctx.repoName! }
  });

  return c.json({ success: true, sessionId: session.id });
});

/**
 * POST /:id/docstrings/generate
 * Automatically generates AI-powered docstrings for repository files.
 */
app.post("/:id/docstrings/generate", async (c) => {
    const docService = new DocstringsService(c.env);
    const db = getDb(c.env.DB);
    const ctx = await fetchProjectContext(db, c.req.param("id"));
    if (!ctx) return c.json({ error: "Context missing" }, 404);

    const body = await c.req.json() as any;
    const result = await docService.generateForProject(ctx.repoOwner!, ctx.repoName!, body.files || []);
    return c.json({ success: true, ...result });
});

export default app;
