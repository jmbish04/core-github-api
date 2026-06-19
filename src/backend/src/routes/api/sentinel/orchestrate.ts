/**
 * @file backend/src/routes/api/sentinel/orchestrate.ts
 * @description UI orchestration endpoint — triggers the StitchLoopWorkflow
 * to autonomously design and build UI components.
 *
 * POST /orchestrate-ui — accepts a UI brief and spawns the workflow
 *
 * @module Routes/Sentinel
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const app = new OpenAPIHono<{ Bindings: Env }>();

const orchestrateRoute = createRoute({
  method: "post",
  path: "/orchestrate-ui",
  operationId: "orchestrateUI",
  tags: ["Sentinel"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            prompt: z.string().min(10).describe("UX design brief"),
            repoOwner: z.string(),
            repoName: z.string(),
            branch: z.string().default("main"),
            routeType: z.enum(["global", "repo"]).default("global"),
            pageId: z.string().describe("Output filename (e.g. 'sentinel-dashboard')"),
            stitchProjectId: z.string().optional(),
            structure: z.array(z.string()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Workflow started",
      content: {
        "application/json": {
          schema: z.object({
            workflowId: z.string(),
            status: z.string(),
          }),
        },
      },
    },
    500: {
      description: "Failed to start workflow",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});

app.openapi(orchestrateRoute, async (c) => {
  const body = c.req.valid("json");

  try {
    const instance = await (c.env as any).STITCH_LOOP_WORKFLOW.create({
      params: {
        prompt: body.prompt,
        repoOwner: body.repoOwner,
        repoName: body.repoName,
        branch: body.branch,
        routeType: body.routeType,
        pageId: body.pageId,
        stitchProjectId: body.stitchProjectId,
        structure: body.structure,
      },
    });

    return c.json({
      workflowId: instance.id,
      status: "started",
    }, 200);
  } catch (err: any) {
    console.error("[Sentinel] Failed to start StitchLoopWorkflow:", err);
    return c.json({ error: err.message || "Failed to start workflow" }, 500);
  }
});

export default app;
