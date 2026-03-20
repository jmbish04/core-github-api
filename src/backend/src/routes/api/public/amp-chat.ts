import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

// This route does not use the default auth guard. 
const app = new OpenAPIHono<{ Bindings: Env }>();

app.openapi(
  createRoute({
    method: "post",
    path: "/",
    summary: "AMP Email Chat",
    description: "Handles chat requests submitted directly from AMP emails.",
    request: {
      query: z.object({
        repo: z.string().optional(),
      }),
      // AMP forms send application/x-www-form-urlencoded by default
      body: {
        content: {
          "application/x-www-form-urlencoded": {
            schema: z.object({
              question: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Agent answer",
        content: {
          "application/json": {
            schema: z.object({
              answer: z.string(),
            }),
          },
        },
      },
      500: {
        description: "Server error",
        content: {
          "application/json": {
            schema: z.object({
              answer: z.string(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("form");
    const question = body.question;
    const query = c.req.valid("query");
    const repo = query.repo;

    // Standard AMP cors validation:
    // https://amp.dev/documentation/guides-and-tutorials/learn/amp-caches-and-cors/amp-cors-requests/
    const origin = c.req.header("origin") || "";
    const sourceOrigin = c.req.query("__amp_source_origin") || "";

    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Expose-Headers", "AMP-Access-Control-Allow-Source-Origin");
    c.header("AMP-Access-Control-Allow-Source-Origin", sourceOrigin);
    c.header("Content-Type", "application/json");

    try {
      const q = typeof question === "string" ? question : "Explain this repo";
      
      const model = typeof c.env.AI_DEFAULT_MODEL === "string" ? c.env.AI_DEFAULT_MODEL : "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
      const result: any = await c.env.AI.run(model, {
        messages: [
          { role: "system", content: `You are a helpful engineering assistant analyzing GitHub repository ${repo || "code"}. Be concise.` },
          { role: "user", content: q }
        ]
      });

      return c.json({ answer: result.response || "No response generated." }, 200);
    } catch (e: any) {
      console.error("[AMP Email Chat Error]:", e);
      return c.json({ answer: "Error: Failed to process request." }, 500);
    }
  }
);

export default app;
