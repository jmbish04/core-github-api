import { Hono } from "hono";
import { cors } from "hono/cors";
import { dispatchRPC } from "./rpc";
import type { Env } from "./types";
import { getKysely, getLatestSessionResults, getSessionResults, listActiveTests } from "./utils/db";
import { runAllTests } from "./tests/runner";

export function buildRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.use("/api/*", cors());

  app.get("/", (c) => c.json({ ok: true, ts: new Date().toISOString(), version: "1.0.0" }));

  // Business logic APIs
  app.post("/api/tasks", async (c) => {
    try {
      const body = await c.req.json();
      const res = await dispatchRPC("createTask", body, c.env, c.executionCtx);
      return c.json(res);
    } catch (e: any) {
      return c.json({ success: false, error: e?.message ?? "Bad request" }, 400);
    }
  });

  app.get("/api/tasks", async (c) => {
    const res = await dispatchRPC("listTasks", null, c.env, c.executionCtx);
    return c.json(res);
  });

  app.post("/api/analyze", async (c) => {
    try {
      const body = await c.req.json();
      const res = await dispatchRPC("runAnalysis", body, c.env, c.executionCtx);
      return c.json(res);
    } catch (e: any) {
      return c.json({ success: false, error: e?.message ?? "Bad request" }, 400);
    }
  });

  // Health and test APIs
  app.get("/api/health", async (c) => {
    const db = getKysely(c.env);
    const latestSession = await getLatestSessionResults(db);
    const isHealthy = latestSession.results.every(r => r.status === 'pass');
    return c.json({
        healthy: isHealthy,
        last_test_session: latestSession,
    });
  });

  app.post("/api/tests/run", async (c) => {
    const session_uuid = crypto.randomUUID();
    c.executionCtx.waitUntil(runAllTests(c.env, session_uuid));
    return c.json({ success: true, session_uuid });
  });

  app.get("/api/tests/latest", async (c) => {
    const db = getKysely(c.env);
    const latestSession = await getLatestSessionResults(db);
    return c.json(latestSession);
  });

  app.get("/api/tests/session/:id", async (c) => {
    const db = getKysely(c.env);
    const sessionId = c.req.param("id");
    const session = await getSessionResults(db, sessionId);
    return c.json(session);
  });

  app.get("/api/tests/defs", async (c) => {
    const db = getKysely(c.env);
    const defs = await listActiveTests(db);
    return c.json({ defs });
  });

  // RPC endpoint
  app.post("/rpc", async (c) => {
    try {
      const { method, params } = await c.req.json();
      const result = await dispatchRPC(method, params, c.env, c.executionCtx);
      return c.json({ success: true, result });
    } catch (e: any) {
      return c.json({ success: false, error: e?.message ?? "RPC error" }, 400);
    }
  });

  return app;
}
