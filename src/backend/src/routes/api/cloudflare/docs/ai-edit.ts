/**
 * @file backend/src/routes/api/agents/cloudflare-docs-ai-edit.ts
 *
 * POST /api/agents/cloudflare-docs/ai-edit
 *
 * Uses the unified AI provider layer (providers/index.ts) to produce a
 * Gemini-drafted revision of the system prompt based on a user instruction.
 * If Gemini fails, automatically falls back to Workers AI.
 *
 * Auth: WORKER_API_KEY via x-api-key header or Authorization: Bearer <key>
 *
 * Body:   { currentPrompt, userInstruction, history? }
 * Returns: { revisedPrompt, provider }
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { generateText, FallbackAlert } from "@/ai/providers";
import { createFallbackHandler } from "@/ai/fallbackLogger";

const app = new Hono<{ Bindings: Env; Variables: { fallbackAlert?: FallbackAlert } }>();

app.use("*", cors({ origin: "*", allowMethods: ["POST", "OPTIONS"] }));

// ─── Schema ───────────────────────────────────────────────────────────────────

const BodySchema = z.object({
  currentPrompt: z.string().min(10),
  userInstruction: z.string().min(3).max(2000),
  /** Optional prior exchange for multi-turn iteration */
  history: z
    .array(z.object({ role: z.enum(["user", "model"]), content: z.string() }))
    .optional(),
});

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function requireAuth(c: any): Promise<boolean> {
  const key =
    c.req.header("x-api-key") ??
    c.req.header("authorization")?.replace("Bearer ", "");
  const { getWorkerApiKey } = await import("@utils/secrets");
  const expected = await getWorkerApiKey(c.env);
  return !!key && !!expected && key === String(expected);
}

// ─── System instruction ───────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are an expert technical writer helping refine AI agent system prompts.
You will be given the CURRENT system prompt and a user instruction describing how to improve it.
Return ONLY the full revised prompt text — no markdown code fences, no preamble, no explanation outside the prompt itself.
Preserve the overall structure and intent of the prompt. Apply the user's changes precisely and concisely.`;

// ─── Route ────────────────────────────────────────────────────────────────────

app.post("/", zValidator("json", BodySchema), async (c) => {
  if (!(await requireAuth(c))) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const { currentPrompt, userInstruction, history = [] } = c.req.valid("json");

  // Build the user prompt, incorporating prior iteration turns
  const historyBlock =
    history.length > 0
      ? `\n\nPRIOR EDITS (for context):\n${history
          .map((t) => `[${t.role.toUpperCase()}]: ${t.content}`)
          .join("\n")}`
      : "";

  const userPrompt =
    `CURRENT SYSTEM PROMPT:\n\`\`\`\n${currentPrompt}\n\`\`\`` +
    historyBlock +
    `\n\nUSER INSTRUCTION: ${userInstruction}`;

  // ── Call AI provider with automatic fallback ───────────────────────────────
  let revisedPrompt = "";
  try {
    revisedPrompt = await generateText(
      c.env,
      userPrompt,
      SYSTEM_INSTRUCTION,
      { temperature: 0.3, maxTokens: 8192, onFallback: createFallbackHandler(c) },
      "gemini"
    );
  } catch (err: any) {
    console.error("[ai-edit] AI provider failed completely:", err?.message);
    return c.json({ success: false, error: err?.message }, 502);
  }

  if (!revisedPrompt?.trim()) {
    return c.json({ success: false, error: "Empty response from AI provider" }, 502);
  }

  const fallbackAlert = c.get("fallbackAlert");

  return c.json({
    success: true,
    revisedPrompt: revisedPrompt.trim(),
    provider: fallbackAlert ? "worker-ai" : "gemini",
    fallbackAlert,
  });
});

export default app;
