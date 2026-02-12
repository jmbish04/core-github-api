/**
 * @file backend/src/routes/api/research.ts
 * @description Research API endpoints for triggering and monitoring DeepResearchWorkflow
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { parseGitHubUrl } from "@/tools/research";

const research = new Hono<{ Bindings: Env }>();

// Request schema
const startResearchSchema = z.object({
  repoUrl: z.string().url().describe("GitHub repository URL"),
});

/**
 * POST /api/research/start
 * Triggers a new DeepResearchWorkflow instance
 */
research.post("/start", zValidator("json", startResearchSchema), async (c) => {
  try {
    const { repoUrl } = c.req.valid("json");

    // Parse GitHub URL
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      return c.json({ error: "Invalid GitHub URL" }, 400);
    }

    const { owner, repo } = parsed;

    // Trigger workflow
    const workflowInstance = await c.env.DEEP_RESEARCH_WORKFLOW.create({
      params: {
        repoUrl,
        repoOwner: owner,
        repoName: repo,
        mode: "targeted",
      },
    });

    // Store workflow metadata in KV for status tracking
    const workflowId = workflowInstance.id;
    await c.env.AGENT_CACHE.put(
      `workflow:${workflowId}`,
      JSON.stringify({
        id: workflowId,
        repoUrl,
        owner,
        repo,
        status: "running",
        startedAt: new Date().toISOString(),
      }),
      { expirationTtl: 86400 } // 24 hours
    );

    return c.json({
      workflowId,
      repoUrl,
      owner,
      repo,
      status: "started",
    });
  } catch (error: any) {
    console.error("[Research API] Start failed:", error);
    return c.json({ error: error.message || "Failed to start research" }, 500);
  }
});

/**
 * GET /api/research/status/:workflowId
 * Polls workflow status (fallback for SSE)
 */
research.get("/status/:workflowId", async (c) => {
  try {
    const workflowId = c.req.param("workflowId");

    // Get workflow metadata from KV
    const metadataJson = await c.env.AGENT_CACHE.get(`workflow:${workflowId}`);
    if (!metadataJson) {
      return c.json({ error: "Workflow not found" }, 404);
    }

    const metadata = JSON.parse(metadataJson);

    // Get workflow instance status
    const instance = await c.env.DEEP_RESEARCH_WORKFLOW.get(workflowId);
    const status = await instance.status();

    return c.json({
      workflowId,
      ...metadata,
      status: status.status,
      output: status.output,
      error: status.error,
    });
  } catch (error: any) {
    console.error("[Research API] Status check failed:", error);
    return c.json({ error: error.message || "Failed to get status" }, 500);
  }
});

/**
 * GET /api/research/stream/:workflowId
 * Server-Sent Events stream for real-time progress
 */
research.get("/stream/:workflowId", async (c) => {
  const workflowId = c.req.param("workflowId");

  // Set SSE headers
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");

  const encoder = new TextEncoder();
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send initial connection event
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ event: "connected", workflowId })}\n\n`)
        );

        // Poll workflow status and stream updates
        const pollInterval = setInterval(async () => {
          if (isClosed) {
            clearInterval(pollInterval);
            return;
          }

          try {
            const instance = await c.env.DEEP_RESEARCH_WORKFLOW.get(workflowId);
            const status = await instance.status();

            // Send status update
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  event: "status",
                  status: status.status,
                  output: status.output,
                })}\n\n`
              )
            );

            // If workflow is complete, send final event and close
            if (status.status === "complete" || status.status === "error") {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    event: "complete",
                    status: status.status,
                    output: status.output,
                    error: status.error,
                  })}\n\n`
                )
              );
              clearInterval(pollInterval);
              controller.close();
              isClosed = true;
            }
          } catch (error) {
            console.error("[SSE] Poll error:", error);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ event: "error", error: "Polling failed" })}\n\n`
              )
            );
          }
        }, 2000); // Poll every 2 seconds

        // Cleanup on client disconnect
        c.req.raw.signal.addEventListener("abort", () => {
          clearInterval(pollInterval);
          controller.close();
          isClosed = true;
        });
      } catch (error: any) {
        console.error("[SSE] Stream error:", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ event: "error", error: error.message })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

export default research;
