/**
 * @file infrastructure.ts
 * @description Cloudflare and GitHub infrastructure management for projects.
 * Handles resource bindings, deployment diagnostics, and overview hydration.
 */

import { Hono } from "hono";
import { getDb } from "@db";
import { 
  fetchProjectContextByOwnerRepo, 
  detectWranglerConfig, 
  extractWranglerBindings
} from "./utils";
import { AIProvider } from "@/ai/providers";

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /:owner/:repo/overview
 * Consolidates project, repository, and Cloudflare infrastructure state.
 */
app.get("/:owner/:repo/overview", async (c) => {
  const db = getDb(c.env.DB);
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const ctx = await fetchProjectContextByOwnerRepo(db, owner, repo);
  if (!ctx) return c.json({ error: "Project not found" }, 404);

  const wrangler = await detectWranglerConfig(c.env, ctx.repoOwner!, ctx.repoName!);

  return c.json({
    success: true,
    project: { ...ctx },
    infrastructure: wrangler ? {
        type: "Cloudflare Worker",
        file: wrangler.fileName,
        bindings: extractWranglerBindings(wrangler.config)
    } : null
  });
});

/**
 * POST /:owner/:repo/bindings
 * Programmatically updates the wrangler configuration with new resource bindings.
 * Also looks up the worker_name from wrangler.jsonc / wrangler.toml in the repo.
 */
app.post("/:owner/:repo/bindings", async (c) => {
  const db = getDb(c.env.DB);
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const ctx = await fetchProjectContextByOwnerRepo(db, owner, repo);
  if (!ctx) return c.json({ error: "Context missing" }, 404);

  const wrangler = await detectWranglerConfig(c.env, ctx.repoOwner!, ctx.repoName!);
  if (!wrangler) return c.json({ error: "No wrangler file found" }, 404);

  const workerName = wrangler.config?.name as string | undefined;

  return c.json({ success: true, workerName, message: "Binding update dispatched (Mock)" });
});

/**
 * POST /:owner/:repo/analyze-deployment
 * AI diagnostic tool for interpreting Cloudflare deployment failure logs.
 */
app.post("/:owner/:repo/analyze-deployment", async (c) => {
  const body = await c.req.json() as any;

  const ai = new AIProvider(c.env);
  const analysis = await ai.generateText(
    `Analyze logs: ${body.logs}`,
    "Diagnose Cloudflare deployment failures accurately."
  );

  return c.json({ success: true, analysis });
});

export default app;
