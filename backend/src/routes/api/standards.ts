
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { JULES_STANDARDS } from "../../config/jules-standards";

const standardsApi = new OpenAPIHono<{ Bindings: Env }>();


standardsApi.openapi(
  createRoute({
    method: "get",
    path: "/",
    summary: "Get Architecture Standards",
    description: "Returns the centralized repository architecture standards as Markdown.",
    responses: {
      200: {
        description: "Standards Markdown",
        content: {
          "text/markdown": {
            schema: z.string(),
          },
          "application/json": {
            schema: z.object({
                content: z.string()
            })
          }
        },
      },
    },
  }),
  (c) => {
    // Content negotiation or default to JSON wrapping for API consistency, 
    // but prompt asked for "Markdown string (or JSON)".
    // Let's support both.
    const accept = c.req.header("Accept") || "";
    if (accept.includes("text/markdown")) {
        return c.text(JULES_STANDARDS);
    }
    return c.json({ content: JULES_STANDARDS });
  }
);

export default standardsApi;
