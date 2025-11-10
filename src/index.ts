import { buildRouter } from "./router";
import { RoomDO } from "./do/RoomDO";
import { buildOpenAPIDocument } from "./utils/openapi";
import { mcpRoutes } from "./mcp";
import { stringify } from "yaml";
import { runAllTests } from "./tests/runner";
import type { Env } from "./types";

const app = buildRouter();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // API and WebSocket routes
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/mcp/") || url.pathname === "/ws" || url.pathname === "/rpc" || url.pathname === "/openapi.json" || url.pathname === "/openapi.yaml") {
        if (url.pathname === "/openapi.json") {
            const doc = buildOpenAPIDocument(`${url.origin}`);
            return new Response(JSON.stringify(doc, null, 2), {
              headers: { "content-type": "application/json;charset=UTF-8" },
            });
        }

        if (url.pathname === "/openapi.yaml") {
            const doc = buildOpenAPIDocument(`${url.origin}`);
            const yaml = stringify(doc);
            return new Response(yaml, { headers: { "content-type": "application/yaml" } });
        }

        if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
            const projectId = url.searchParams.get("projectId") ?? "default";
            const id = env.ROOM_DO.idFromName(projectId);
            const stub = env.ROOM_DO.get(id);
            return stub.fetch(request);
        }

        if (url.pathname.startsWith("/mcp/")) {
            const routes = mcpRoutes();
            if (url.pathname === "/mcp/tools" && request.method === "GET") {
                return Response.json(await routes.tools());
            }
            if (url.pathname === "/mcp/execute" && request.method === "POST") {
                try {
                    const body = await request.json();
                    const res = await routes.execute(env, ctx, body);
                    return Response.json(res);
                } catch (e: any) {
                    return Response.json({ success: false, error: e?.message ?? "MCP error" }, { status: 400 });
                }
            }
        }

        return app.fetch(request, env, ctx);
    }


    // Serve static assets
    return env.ASSETS.fetch(request);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runAllTests(env));
  },
};

export { RoomDO };
