/**
 * @file backend/src/routes/api/agents/cloudflare-docs-prompt.ts
 *
 * Exposes the Cloudflare Docs Agent system prompt as a configurable resource.
 *
 * Public endpoints (no auth required — safe for cross-worker access):
 *   GET /api/agents/cloudflare-docs/system-prompt
 *     Returns: { systemPrompt: string, lastUpdated: string | null, source: "kv" | "default" }
 *
 * Authenticated endpoints (WORKER_API_KEY via x-api-key or Authorization header):
 *   PUT /api/agents/cloudflare-docs/system-prompt        — save a new prompt to KV + record revision in D1
 *   DELETE /api/agents/cloudflare-docs/system-prompt     — reset to default (removes KV key) + record revision
 *
 * Other workers that embed a Cloudflare Docs Agent can pull the prompt via:
 *   GET https://core-github-api.hacolby.workers.dev/api/agents/cloudflare-docs/system-prompt
 * and fall back to their own SYSTEM_PROMPT_BASE constant if the request fails.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { drizzle } from "drizzle-orm/d1";
import { SYSTEM_PROMPT_BASE } from "@/ai/agents/CloudflareDocs";
import { CF_DOCS_PROMPT_KV_KEY } from "@/ai/agents/constants";
import { promptRevisions } from "@db/schema";

export { CF_DOCS_PROMPT_KV_KEY };

const UpdatePromptSchema = z.object({
  systemPrompt: z.string().min(20, "Prompt must be at least 20 characters").max(32_000, "Prompt exceeds 32 KB limit"),
});

const app = new Hono<{ Bindings: Env }>();

// Allow all origins for cross-worker reads on the GET endpoint.
app.use("*", cors({ origin: "*", allowMethods: ["GET", "PUT", "DELETE", "OPTIONS"] }));

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function requireAuth(c: any): Promise<boolean> {
  const key =
    c.req.header("x-api-key") ??
    c.req.header("authorization")?.replace("Bearer ", "");
  const { getWorkerApiKey } = await import("@utils/secrets");
  const expected = await getWorkerApiKey(c.env);
  return !!key && !!expected && key === String(expected);
}

// ─── Line-level diff helper ───────────────────────────────────────────────────

function lineDiff(a: string, b: string): { removed: string; added: string } {
  const setA = new Set(a.split("\n").map((l) => l.trimEnd()));
  const setB = new Set(b.split("\n").map((l) => l.trimEnd()));

  const removed = [...setA].filter((l) => !setB.has(l) && l.trim()).join("\n");
  const added   = [...setB].filter((l) => !setA.has(l) && l.trim()).join("\n");

  const MAX = 10_000;
  return {
    removed: removed.length > MAX ? removed.slice(0, MAX) + "\n…(truncated)" : removed,
    added:   added.length   > MAX ? added.slice(0, MAX)   + "\n…(truncated)" : added,
  };
}

// ─── Helper: read current KV prompt ─────────────────────────────────────────

async function getCurrentPrompt(env: Env): Promise<string> {
  try {
    const raw = await env.KV_CONFIGS.get(CF_DOCS_PROMPT_KV_KEY);
    if (!raw) return SYSTEM_PROMPT_BASE;
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* raw string */ }
    return (parsed && typeof parsed === "object" && "value" in parsed)
      ? (parsed.value as string)
      : raw;
  } catch {
    return SYSTEM_PROMPT_BASE;
  }
}

// ─── GET (public) ─────────────────────────────────────────────────────────────
/**
 * @openapi
 * /api/agents/cloudflare-docs/system-prompt:
 *   get:
 *     summary: Get the active Cloudflare Docs Agent system prompt
 *     responses:
 *       200:
 *         description: Active system prompt
 */
app.get("/", async (c) => {
  try {
    const raw = await c.env.KV_CONFIGS.get(CF_DOCS_PROMPT_KV_KEY);

    if (raw) {
      let parsed: any = null;
      try { parsed = JSON.parse(raw); } catch { /* raw string */ }

      const prompt = (parsed && typeof parsed === "object" && "value" in parsed)
        ? (parsed.value as string)
        : raw;

      return c.json({
        systemPrompt: prompt,
        lastUpdated: parsed?.updatedAt ?? null,
        source: "kv" as const,
      });
    }

    return c.json({
      systemPrompt: SYSTEM_PROMPT_BASE,
      lastUpdated: null,
      source: "default" as const,
    });
  } catch (err: any) {
    return c.json({
      systemPrompt: SYSTEM_PROMPT_BASE,
      lastUpdated: null,
      source: "default" as const,
      warning: err?.message,
    });
  }
});

// ─── PUT (authenticated) ─────────────────────────────────────────────────────
/**
 * @openapi
 * /api/agents/cloudflare-docs/system-prompt:
 *   put:
 *     summary: Save a custom system prompt to KV (records revision in D1)
 *     security:
 *       - ApiKey: []
 */
app.put("/", zValidator("json", UpdatePromptSchema), async (c) => {
  if (!(await requireAuth(c))) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const { systemPrompt } = c.req.valid("json");
  const prior = await getCurrentPrompt(c.env);
  const now = new Date().toISOString();

  const stored = JSON.stringify({
    key: CF_DOCS_PROMPT_KV_KEY,
    value: systemPrompt,
    type: "string",
    category: "agents",
    description: "Custom system prompt for the Cloudflare Docs Agent",
    isSecretStoreManaged: false,
    updatedAt: now,
    updatedBy: "admin_ui",
  });

  await c.env.KV_CONFIGS.put(CF_DOCS_PROMPT_KV_KEY, stored);

  // Record revision in D1
  try {
    const { removed, added } = lineDiff(prior, systemPrompt);
    const db = drizzle(c.env.DB);
    await db.insert(promptRevisions).values({
      prior_config_prompt: prior,
      new_config_prompt_value: systemPrompt,
      removed_language: removed || null,
      added_language: added || null,
      changed_by: "ui",
    });
  } catch (err) {
    // Don't fail the save if revision logging fails
    console.error("[prompt-revisions] D1 insert error:", err);
  }

  return c.json({ success: true, lastUpdated: now });
});

// ─── DELETE (authenticated) — reset to default ────────────────────────────────
/**
 * @openapi
 * /api/agents/cloudflare-docs/system-prompt:
 *   delete:
 *     summary: Reset system prompt to built-in default (records revision in D1)
 *     security:
 *       - ApiKey: []
 */
app.delete("/", async (c) => {
  if (!(await requireAuth(c))) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const prior = await getCurrentPrompt(c.env);
  await c.env.KV_CONFIGS.delete(CF_DOCS_PROMPT_KV_KEY);

  // Record revision in D1
  try {
    const { removed, added } = lineDiff(prior, SYSTEM_PROMPT_BASE);
    const db = drizzle(c.env.DB);
    await db.insert(promptRevisions).values({
      prior_config_prompt: prior,
      new_config_prompt_value: SYSTEM_PROMPT_BASE,
      removed_language: removed || null,
      added_language: added || null,
      changed_by: "ui_reset",
    });
  } catch (err) {
    console.error("[prompt-revisions] D1 insert error:", err);
  }

  return c.json({ success: true, message: "Reset to default", systemPrompt: SYSTEM_PROMPT_BASE });
});

export default app;
