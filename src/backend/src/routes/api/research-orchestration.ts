/**
 * @file src/routes/api/research-orchestration.ts
 * @description Endpoints for coordinating the multi-agent research scripts
 */
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { drizzle } from "drizzle-orm/d1";
import { newsletterRepos } from "@/db/schemas/app/research";
import { inArray } from "drizzle-orm";

const app = new OpenAPIHono<{ Bindings: Env }>();

app.openapi(createRoute({
  method: "post",
  path: "/check-deduplication",
  description: "Check which repositories have NOT been researched yet",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            repoUrls: z.array(z.string().url())
          })
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            newRepos: z.array(z.string().url())
          })
        }
      },
      description: "List of unresearched repositories"
    }
  }
}), async (c) => {
  const { repoUrls } = c.req.valid("json");
  if (!repoUrls || repoUrls.length === 0) {
    return c.json({ newRepos: [] });
  }

  const db = drizzle(c.env.DB);
  
  const existingRows = await db.select({ repoUrl: newsletterRepos.repoUrl })
    .from(newsletterRepos)
    .where(inArray(newsletterRepos.repoUrl, repoUrls))
    .all();

  const existingUrls = new Set(existingRows.map(r => r.repoUrl));
  const newRepos = repoUrls.filter(url => !existingUrls.has(url));

  return c.json({ newRepos });
});

app.openapi(createRoute({
  method: "get",
  path: "/config",
  description: "Get configuration for the Python agents including AI Gateway URL",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            aiGatewayUrl: z.string().url()
          })
        }
      },
      description: "Config for Python agents"
    }
  }
}), async (c) => {
  // `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/openai`
  const accountId = c.env.CLOUDFLARE_ACCOUNT_ID || "unknown_account";
  const gatewayId = c.env.AI_GATEWAY_NAME || "core-github-api";
  const aiGatewayUrl = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/openai`;
  
  return c.json({ aiGatewayUrl });
});

app.openapi(createRoute({
  method: "get",
  path: "/ws/{sessionId}",
  description: "Upgrade connection to WebSocket DO for the given session",
  request: {
    params: z.object({
      sessionId: z.string()
    })
  },
  responses: {
    101: {
      description: "WebSocket Upgrade"
    }
  }
}), async (c) => {
  const { sessionId } = c.req.valid("param");
  const id = c.env.AGENT_SESSION_DO.idFromName(sessionId);
  const stub = c.env.AGENT_SESSION_DO.get(id);

  return stub.fetch(c.req.raw);
});

export default app;
