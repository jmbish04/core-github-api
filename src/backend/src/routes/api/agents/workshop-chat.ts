/**
 * @file src/routes/api/agents/workshop-chat.ts
 * @description Dedicated route for the CfWorkshop_AgentsSdk Agent Factory chat.
 */

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { generateUuid } from "@/utils/common";

const workshopChatApi = new OpenAPIHono<{ Bindings: Env }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: "Validation failed",
          details:
            (result.error as any).errors ||
            (result.error as any).issues ||
            result.error,
        },
        400
      );
    }
  },
});

const WorkshopChatRequestSchema = z.object({
  message: z.string(),
  sessionId: z.string().optional(),
  history: z
    .array(z.object({ role: z.string(), content: z.string() }))
    .optional()
    .default([]),
  context: z.object({ repoUrl: z.string().optional() }).optional(),
  source: z.string().optional().default("api"),
  model: z.string().optional(),
});

const WorkshopChatResponseSchema = z.object({
  response: z.string(),
  blocks: z
    .array(
      z.object({
        type: z.enum(["section_header", "text", "codeblock"]),
        text: z.string(),
        language: z.string().optional(),
      })
    )
    .optional(),
  followupPrompts: z.array(z.string()),
  sessionId: z.string(),
  modelUsed: z.string(),
});

const route = createRoute({
  method: "post",
  path: "/workshop-chat",
  operationId: "chatWithWorkshopAgent",
  tags: ["Agents"],
  summary: "Chat with the Honi workshop agent",
  request: {
    body: {
      content: { "application/json": { schema: WorkshopChatRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "Workshop Agent chat response",
      content: {
        "application/json": { schema: WorkshopChatResponseSchema },
      },
    },
    400: {
      description: "Validation Error",
      content: {
        "application/json": {
          schema: z.object({ error: z.string(), details: z.any().optional() }),
        },
      },
    },
    500: {
      description: "Internal Server Error",
      content: {
        "application/json": { schema: z.object({ error: z.string() }) },
      },
    },
  },
});

workshopChatApi.openapi(route, async (c) => {
  try {
    const { message, sessionId: providedSessionId, history, context, source, model } =
      c.req.valid("json");

    const sessionId = providedSessionId || generateUuid();
    const id = c.env.WORKSHOP_AGENT.idFromName(sessionId);
    const stub = c.env.WORKSHOP_AGENT.get(id);

    interface ChatResult {
      blocks?: Array<{ type: string; text: string; language?: string }>;
      response: string;
      followupPrompts: string[];
      modelUsed: string;
      sessionId: string;
    }

    // @ts-ignore — Suppress deep type instantiation
    const result = (await (stub as any).chat(
      message,
      history,
      context,
      source,
      sessionId,
      model
    )) as ChatResult;

    return c.json({
      blocks: result.blocks ?? [],
      response: result.response,
      followupPrompts: result.followupPrompts ?? [],
      sessionId: result.sessionId ?? sessionId,
      modelUsed: result.modelUsed ?? "unknown",
    } as any);
  } catch (err: any) {
    console.error("[workshop-chat] Unhandled exception:", err);
    return c.json(
      {
        error:
          err.message ||
          "An unexpected error occurred communicating with the Workshop Agent.",
      } as any,
      500
    );
  }
});

export default workshopChatApi;
