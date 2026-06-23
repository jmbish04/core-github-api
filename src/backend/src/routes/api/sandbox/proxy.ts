/**
 * @file routes/api/sandbox/proxy.ts
 * @description Worker-side proxy endpoints for D1/KV/R2 binding access from sandbox containers.
 *
 * SECURITY: All routes require the X-Worker-Api-Key header to match the
 * WORKER_API_KEY secret. This prevents unauthorized access to bindings.
 *
 * Container servers call these endpoints (via the COLBY_WORKER_URL env var)
 * because Cloudflare Sandbox containers cannot directly access Worker bindings.
 */

import { Hono } from "hono";
import { getDb } from "@db";
import { Logger } from "@/lib/logger";
import { getSecret } from "@/utils/secrets";
import { sql } from "drizzle-orm";

const proxyApi = new Hono<{ Bindings: Env }>();

// ── Auth Middleware ───────────────────────────────────────────────────────────

proxyApi.use("*", async (c, next) => {
  const logger = new Logger(c.env, "SandboxProxy");
  const apiKey = c.req.header("X-Worker-Api-Key") ?? c.req.header("x-worker-api-key");
  const expected = await getSecret(c.env, "WORKER_API_KEY");

  if (!apiKey || apiKey !== expected) {
    logger.warn("[SandboxProxy] Unauthorized proxy request");
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
});

// ── D1 Proxy ─────────────────────────────────────────────────────────────────

/**
 * POST /api/sandbox/proxy/d1
 * Body: { query: string, params?: unknown[], database?: "core" | "webhooks" }
 */
proxyApi.post("/d1", async (c) => {
  const logger = new Logger(c.env, "SandboxProxy - D1");
  const body = await c.req.json<{ query: string; params?: unknown[]; database?: string }>();

  if (!body.query) return c.json({ error: "query is required" }, 400);

  try {
    const db = getDb(c.env.DB);
    const result = await db.run(sql.raw(body.query));
    return c.json({ success: true, result });
  } catch (error: any) {
    logger.error(`D1 proxy error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ── KV Proxy ──────────────────────────────────────────────────────────────────

/**
 * POST /api/sandbox/proxy/kv
 * Body: { operation: "get" | "put" | "delete", key: string, value?: string, ttl?: number }
 */
proxyApi.post("/kv", async (c) => {
  const logger = new Logger(c.env, "SandboxProxy - KV");
  const body = await c.req.json<{ operation: "get" | "put" | "delete"; key: string; value?: string; ttl?: number }>();

  const { operation, key, value, ttl } = body;
  if (!operation || !key) return c.json({ error: "operation and key are required" }, 400);

  const kv = c.env.AGENT_CACHE;
  if (!kv) return c.json({ error: "KV binding AGENT_CACHE not configured" }, 503);

  try {
    if (operation === "get") {
      const val = await kv.get(key);
      return c.json({ success: true, value: val });
    }
    if (operation === "put") {
      await kv.put(key, value ?? "", ttl ? { expirationTtl: ttl } : undefined);
      return c.json({ success: true });
    }
    if (operation === "delete") {
      await kv.delete(key);
      return c.json({ success: true });
    }
    return c.json({ error: `Unknown operation: ${operation}` }, 400);
  } catch (error: any) {
    logger.error(`KV proxy error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ── R2 Proxy ──────────────────────────────────────────────────────────────────

/**
 * POST /api/sandbox/proxy/r2
 * Body: { operation: "get" | "put" | "delete" | "head", key: string, body?: string, contentType?: string }
 */
proxyApi.post("/r2", async (c) => {
  const logger = new Logger(c.env, "SandboxProxy - R2");
  const body = await c.req.json<{ operation: "get" | "put" | "delete" | "head"; key: string; body?: string; contentType?: string }>();

  const { operation, key } = body;
  if (!operation || !key) return c.json({ error: "operation and key are required" }, 400);

  const r2 = (c.env as any).ARTIFACT_STORE as R2Bucket | undefined;
  if (!r2) return c.json({ error: "R2 binding ARTIFACT_STORE not configured" }, 503);

  try {
    if (operation === "get") {
      const obj = await r2.get(key);
      if (!obj) return c.json({ success: false, found: false });
      const text = await obj.text();
      return c.json({ success: true, found: true, content: text, contentType: obj.httpMetadata?.contentType });
    }
    if (operation === "put") {
      await r2.put(key, body.body ?? "", { httpMetadata: { contentType: body.contentType ?? "text/plain" } });
      return c.json({ success: true });
    }
    if (operation === "delete") {
      await r2.delete(key);
      return c.json({ success: true });
    }
    if (operation === "head") {
      const obj = await r2.head(key);
      return c.json({ success: true, found: !!obj, key: obj?.key, size: obj?.size });
    }
    return c.json({ error: `Unknown operation: ${operation}` }, 400);
  } catch (error: any) {
    logger.error(`R2 proxy error: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

export default proxyApi;
