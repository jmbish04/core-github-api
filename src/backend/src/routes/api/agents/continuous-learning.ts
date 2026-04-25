/**
 * @file routes/api/continuous-learning.ts
 * @description Hono proxy routes bridging frontend requests to the LearningAgent.
 *
 * The agent handles its own business logic; this router simply resolves the DO
 * instance (singleton "main") and forwards requests.
 *
 * Routes (all prefixed /api/continuous-learning):
 *   GET  /pending           → List all HITL approval records
 *   POST /queue             → Queue a new CI build analysis
 *   POST /approve/:id       → Approve an item
 *   POST /reject/:id        → Reject an item
 *   POST /retry/:id         → Re-queue an expired item
 */

import { Hono } from "hono";
import { getAgentByName } from "agents";

const app = new Hono<{ Bindings: Env }>();

const AGENT_NAME = "main"; // Singleton instance for the approval queue

/** Forward requests to the LearningAgent DO */
async function forward(c: any, pathname: string, init?: RequestInit) {
  const agent = await getAgentByName(c.env.LEARNING_AGENT, AGENT_NAME);
  const requestUrl = new URL(c.req.url);
  requestUrl.pathname = pathname;

  const body = init?.body ?? (c.req.method !== "GET" ? await c.req.raw.clone().text() : undefined);

  const response = await (agent as any).fetch(
    new Request(requestUrl.toString(), {
      method: c.req.method,
      headers: c.req.raw.headers,
      body,
      ...(init ?? {}),
    })
  );

  const data = await response.json();
  return c.json(data, response.status);
}

app.get("/pending", (c) => forward(c, "/pending"));
app.post("/queue", (c) => forward(c, "/queue"));
app.post("/approve/:id", (c) => forward(c, `/approve/${c.req.param("id")}`));
app.post("/reject/:id", (c) => forward(c, `/reject/${c.req.param("id")}`));
app.post("/retry/:id", (c) => forward(c, `/retry/${c.req.param("id")}`));

export default app;
